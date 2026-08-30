// server/src/services/varianceService.js

const db = require('../db');
const { round2 } = require('../utils/helpers');

/**
 * Calculate expected vs actual stock for a count
 * Expected = Opening + Purchases - Consumption - Wastage + Transfers In - Transfers Out
 * @param {number} ingredientId 
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {object} { expected_qty, actual_qty, variance_qty, variance_value, variance_percent }
 */
function calculateVariance(ingredientId, startDate, endDate) {
  // Get opening stock (sum of all movements before start date)
  const opening = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN movement_type IN ('purchase', 'transfer_in', 'opening', 'count_correction') THEN qty_base ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN movement_type IN ('sale', 'wastage', 'transfer_out', 'count_correction') THEN ABS(qty_base) ELSE 0 END), 0) as total_out
    FROM stock_movements
    WHERE ingredient_id = ? AND movement_date < ?
  `).get(ingredientId, startDate);

  const openingQty = opening.total_in - opening.total_out;

  // Get movements during count period
  const movements = db.prepare(`
    SELECT 
      movement_type,
      SUM(qty_base) as total_qty
    FROM stock_movements
    WHERE ingredient_id = ? AND movement_date >= ? AND movement_date <= ?
    GROUP BY movement_type
  `).all(ingredientId, startDate, endDate);

  let purchases = 0;
  let sales = 0;
  let wastage = 0;
  let transferIn = 0;
  let transferOut = 0;
  let corrections = 0;

  for (const m of movements) {
    switch (m.movement_type) {
      case 'purchase':
        purchases += m.total_qty;
        break;
      case 'sale':
        sales += Math.abs(m.total_qty);
        break;
      case 'wastage':
        wastage += Math.abs(m.total_qty);
        break;
      case 'transfer_in':
        transferIn += m.total_qty;
        break;
      case 'transfer_out':
        transferOut += Math.abs(m.total_qty);
        break;
      case 'count_correction':
        corrections += m.total_qty;
        break;
    }
  }

  // Expected = Opening + Purchases - Sales - Wastage + Transfer In - Transfer Out
  const expectedQty = openingQty + purchases - sales - wastage + transferIn - transferOut;

  // Get current actual stock (from inventory or latest count)
  const currentStock = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN movement_type IN ('purchase', 'transfer_in', 'opening', 'count_correction') THEN qty_base ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN movement_type IN ('sale', 'wastage', 'transfer_out', 'count_correction') THEN ABS(qty_base) ELSE 0 END), 0) as total_out
    FROM stock_movements
    WHERE ingredient_id = ?
  `).get(ingredientId);

  const actualQty = currentStock.total_in - currentStock.total_out;

  const varianceQty = actualQty - expectedQty;

  // Get current cost for variance value
  const ingredient = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(ingredientId);
  const unitCost = ingredient?.current_cost_per_base || 0;
  const varianceValue = round2(varianceQty * unitCost);
  const variancePercent = expectedQty !== 0 ? round2((varianceQty / expectedQty) * 100) : 0;

  return {
    ingredient_id: ingredientId,
    start_date: startDate,
    end_date: endDate,
    opening_qty: round2(openingQty),
    purchases_qty: round2(purchases),
    sales_qty: round2(sales),
    wastage_qty: round2(wastage),
    transfer_in_qty: round2(transferIn),
    transfer_out_qty: round2(transferOut),
    expected_qty: round2(expectedQty),
    actual_qty: round2(actualQty),
    variance_qty: round2(varianceQty),
    variance_value: varianceValue,
    variance_percent: variancePercent,
  };
}

/**
 * Get variance summary by shift/employee for a date range
 * @param {string} startDate 
 * @param {string} endDate 
 * @returns {array} Variance records grouped by shift and employee
 */
function getVarianceByShift(startDate, endDate) {
  const variances = db.prepare(`
    SELECT 
      sm.user_id,
      u.name as employee_name,
      sm.shift,
      sm.movement_type,
      COUNT(*) as movement_count,
      SUM(sm.qty_base) as total_qty_base,
      SUM(sm.total_cost) as total_value
    FROM stock_movements sm
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.movement_date >= ? AND sm.movement_date <= ?
      AND sm.movement_type IN ('sale', 'wastage', 'count_correction')
    GROUP BY sm.user_id, sm.shift, sm.movement_type
    ORDER BY sm.shift, u.name, sm.movement_type
  `).all(startDate, endDate);

  return variances;
}

/**
 * Get variance summary by ingredient for a date range
 * @param {string} startDate 
 * @param {string} endDate 
 * @returns {array} Variance records by ingredient
 */
function getVarianceByIngredient(startDate, endDate) {
  const variances = db.prepare(`
    SELECT 
      i.id as ingredient_id,
      i.name as ingredient_name,
      i.code as ingredient_code,
      COUNT(*) as movement_count,
      SUM(sm.qty_base) as total_qty_base,
      SUM(sm.total_cost) as total_value,
      AVG(sm.unit_cost) as avg_unit_cost
    FROM stock_movements sm
    JOIN ingredients i ON sm.ingredient_id = i.id
    WHERE sm.movement_date >= ? AND sm.movement_date <= ?
      AND sm.movement_type IN ('sale', 'wastage', 'count_correction')
    GROUP BY i.id, i.name, i.code
    HAVING ABS(SUM(sm.qty_base)) > 0
    ORDER BY ABS(total_value) DESC
  `).all(startDate, endDate);

  return variances;
}

module.exports = {
  calculateVariance,
  getVarianceByShift,
  getVarianceByIngredient,
};
