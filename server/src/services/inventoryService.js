// server/src/services/inventoryService.js

/**
 * Central inventory service - the single source of truth for stock movements.
 * All stock changes flow through postMovement() - no other code inserts into stock_movements.
 */

const db = require('../db');
const { round2, round3 } = require('../utils/helpers');
const { ValidationError } = require('../utils/errors');

/**
 * Post a stock movement (the ONLY way to modify stock)
 * Must be called within a transaction for multi-step operations
 * 
 * @param {object} params - Movement parameters
 * @param {number} params.ingredientId - Ingredient ID
 * @param {string} params.movementType - Type: purchase|sale|wastage|transfer_in|transfer_out|count_correction|opening
 * @param {number} params.qtyBase - Quantity in base units (positive for IN, negative for OUT)
 * @param {number} params.unitCost - Cost per base unit
 * @param {string|null} params.referenceType - Reference entity type (e.g., 'purchase', 'sale')
 * @param {number|null} params.referenceId - Reference entity ID
 * @param {number|null} params.locationId - Storage location ID
 * @param {number|null} params.createdBy - User ID who created the movement
 * @param {string|null} params.batchNumber - Optional batch number
 * @param {string|null} params.expiryDate - Optional expiry date
 * @returns {number} - ID of inserted movement
 */
function postMovement({
  ingredientId,
  movementType,
  qtyBase,
  unitCost,
  referenceType = null,
  referenceId = null,
  locationId = null,
  createdBy = null,
  batchNumber = null,
  expiryDate = null,
}) {
  // Validate movement type
  const validTypes = ['purchase', 'sale', 'wastage', 'transfer_in', 'transfer_out', 'count_correction', 'opening'];
  if (!validTypes.includes(movementType)) {
    throw new ValidationError(`Invalid movement type: ${movementType}`);
  }
  
  const qtyBaseRounded = round3(qtyBase);
  const unitCostRounded = round2(unitCost);
  const totalCost = round2(Math.abs(qtyBaseRounded) * unitCostRounded);
  
  const stmt = db.prepare(`
    INSERT INTO stock_movements (
      ingredient_id, movement_type, qty_base, unit_cost, total_cost,
      movement_date, reference_type, reference_id, location_id, created_by,
      batch_number, expiry_date
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    ingredientId,
    movementType,
    qtyBaseRounded,
    unitCostRounded,
    totalCost,
    referenceType,
    referenceId,
    locationId,
    createdBy,
    batchNumber,
    expiryDate
  );
  
  return result.lastInsertRowid;
}

/**
 * Get current stock level for an ingredient
 * Calculates from sum of all movements (source of truth)
 * 
 * @param {number} ingredientId - Ingredient ID
 * @returns {object} - { qtyBase: number, value: number }
 */
function getStock(ingredientId) {
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(qty_base), 0) as qty_base,
      COALESCE(SUM(total_cost), 0) as value
    FROM stock_movements
    WHERE ingredient_id = ?
  `);
  
  const result = stmt.get(ingredientId);
  return {
    qtyBase: round3(result.qty_base),
    value: round2(result.value),
  };
}

/**
 * Get stock levels for multiple ingredients
 * @param {number[]} ingredientIds - Array of ingredient IDs
 * @returns {Map<number, object>} - Map of ingredientId -> { qtyBase, value }
 */
function getStockLevels(ingredientIds) {
  if (!ingredientIds || ingredientIds.length === 0) {
    return new Map();
  }
  
  const placeholders = ingredientIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT 
      ingredient_id,
      COALESCE(SUM(qty_base), 0) as qty_base,
      COALESCE(SUM(total_cost), 0) as value
    FROM stock_movements
    WHERE ingredient_id IN (${placeholders})
    GROUP BY ingredient_id
  `);
  
  const results = stmt.all(...ingredientIds);
  const stockMap = new Map();
  
  for (const row of results) {
    stockMap.set(row.ingredient_id, {
      qtyBase: round3(row.qty_base),
      value: round2(row.value),
    });
  }
  
  // Include zero stock for ingredients with no movements
  for (const id of ingredientIds) {
    if (!stockMap.has(id)) {
      stockMap.set(id, { qtyBase: 0, value: 0 });
    }
  }
  
  return stockMap;
}

/**
 * Get stock movements for an ingredient within a date range
 */
function getMovements(ingredientId, options = {}) {
  const { startDate, endDate, movementType, limit = 100, offset = 0 } = options;
  
  let sql = `
    SELECT 
      sm.id, sm.ingredient_id, sm.movement_type, sm.qty_base, sm.unit_cost, sm.total_cost,
      sm.movement_date, sm.reference_type, sm.reference_id, sm.batch_number, sm.expiry_date,
      sm.location_id, l.name as location_name, u.code as unit_code,
      i.name as ingredient_name, i.base_unit_id
    FROM stock_movements sm
    JOIN ingredients i ON sm.ingredient_id = i.id
    JOIN units u ON i.base_unit_id = u.id
    LEFT JOIN locations l ON sm.location_id = l.id
    WHERE sm.ingredient_id = ?
  `;
  
  const params = [ingredientId];
  
  if (startDate) {
    sql += ' AND sm.movement_date >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    sql += ' AND sm.movement_date <= ?';
    params.push(endDate);
  }
  
  if (movementType) {
    sql += ' AND sm.movement_type = ?';
    params.push(movementType);
  }
  
  sql += ' ORDER BY sm.movement_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * Get total movements count for pagination
 */
function getMovementsCount(ingredientId, options = {}) {
  const { startDate, endDate, movementType } = options;
  
  let sql = `
    SELECT COUNT(*) as count
    FROM stock_movements
    WHERE ingredient_id = ?
  `;
  
  const params = [ingredientId];
  
  if (startDate) {
    sql += ' AND movement_date >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    sql += ' AND movement_date <= ?';
    params.push(endDate);
  }
  
  if (movementType) {
    sql += ' AND movement_type = ?';
    params.push(movementType);
  }
  
  const stmt = db.prepare(sql);
  return stmt.get(...params).count;
}

module.exports = {
  postMovement,
  getStock,
  getStockLevels,
  getMovements,
  getMovementsCount,
};
