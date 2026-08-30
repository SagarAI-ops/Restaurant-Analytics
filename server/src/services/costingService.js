// server/src/services/costingService.js

/**
 * Weighted Moving Average (WMA) costing service.
 * Updates average cost on purchase confirmations.
 */

const db = require('../db');
const { round2, round3 } = require('../utils/helpers');

/**
 * Get current stock and value for an ingredient
 */
function getStockValue(ingredientId) {
  const stmt = db.prepare(`
    SELECT 
      SUM(qty_base) as total_qty,
      SUM(total_cost) as total_value
    FROM stock_movements
    WHERE ingredient_id = ?
  `);
  const result = stmt.get(ingredientId);
  return {
    qty: round3(result.total_qty || 0),
    value: round2(result.total_value || 0),
  };
}

/**
 * Update weighted moving average cost after a purchase
 * Called within a transaction during purchase confirmation
 * 
 * @param {number} ingredientId - Ingredient ID
 * @param {number} qtyBase - Quantity purchased in base units
 * @param {number} totalCost - Total cost of purchase
 */
function updateWMA(ingredientId, qtyBase, totalCost) {
  const { qty: currentQty, value: currentValue } = getStockValue(ingredientId);
  
  // Calculate new weighted average
  const newQty = round3(currentQty + qtyBase);
  const newValue = round2(currentValue + totalCost);
  
  let newAvgCost = 0;
  if (newQty > 0) {
    newAvgCost = round2(newValue / newQty);
  }
  
  // Update ingredient's current cost
  const updateStmt = db.prepare(`
    UPDATE ingredients 
    SET current_cost_per_base = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  updateStmt.run(newAvgCost, ingredientId);
  
  return newAvgCost;
}

/**
 * Get the current WMA cost for an ingredient
 */
function getCurrentCost(ingredientId) {
  const stmt = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?');
  const result = stmt.get(ingredientId);
  return result ? round2(result.current_cost_per_base) : 0;
}

/**
 * Calculate the value of consumed stock at current WMA
 */
function calculateConsumptionValue(ingredientId, qtyBaseConsumed) {
  const avgCost = getCurrentCost(ingredientId);
  return round2(qtyBaseConsumed * avgCost);
}

module.exports = {
  updateWMA,
  getCurrentCost,
  calculateConsumptionValue,
  getStockValue,
};
