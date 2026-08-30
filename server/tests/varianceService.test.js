// server/tests/varianceService.test.js

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateVariance } from '../src/services/varianceService.js';
import db from '../src/db.js';

describe('varianceService', () => {
  let ingredientId;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(today);

  beforeAll(() => {
    // Create test ingredient (chicken scenario)
    const baseUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('kg');
    const result = db.prepare(`
      INSERT INTO ingredients (code, name, base_unit_id, current_cost_per_base, is_active)
      VALUES ('TEST_CHICKEN', 'Test Chicken', ?, 240, 1)
    `).run(baseUnit.id);
    ingredientId = result.lastInsertRowid;

    // Scenario: opening 20kg + purchases 30kg − consumption 42kg − wastage 2kg = expected 6kg
    // Actual 4.5kg → variance −1.5kg, −₹360 (at ₹240/kg)
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Opening stock: 20kg
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date, shift)
      VALUES (?, 'opening', 20000, 240, 4800000, ?, 'morning')
    `).run(ingredientId, startDateStr);

    // Purchases: 30kg
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date, shift)
      VALUES (?, 'purchase', 30000, 240, 7200000, ?, 'morning')
    `).run(ingredientId, startDateStr);

    // Consumption (sales): 42kg
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date, shift)
      VALUES (?, 'sale', -42000, 240, 10080000, ?, 'evening')
    `).run(ingredientId, endDateStr);

    // Wastage: 2kg
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date, shift, reason)
      VALUES (?, 'wastage', -2000, 240, 480000, ?, 'evening', 'spoilage')
    `).run(ingredientId, endDateStr);

    // Actual remaining should be 6kg, but we simulate actual 4.5kg via count_correction
    // Expected: 20 + 30 - 42 - 2 = 6kg
    // Actual: 4.5kg
    // Variance: 4.5 - 6 = -1.5kg, value = -1.5 * 240 = -₹360
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date, shift, reason)
      VALUES (?, 'count_correction', -1500, 240, 360000, ?, 'night', 'variance_adjustment')
    `).run(ingredientId, endDateStr);
  });

  afterAll(() => {
    // Clean up test data
    db.prepare('DELETE FROM stock_movements WHERE ingredient_id = ?').run(ingredientId);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(ingredientId);
  });

  it('should calculate expected qty correctly: opening 20kg + purchases 30kg − consumption 42kg − wastage 2kg = 6kg', () => {
    const result = calculateVariance(ingredientId, startDate.toISOString(), endDate.toISOString());
    
    expect(result.opening_qty).toBe(20000);
    expect(result.purchases_qty).toBe(30000);
    expect(result.sales_qty).toBe(42000);
    expect(result.wastage_qty).toBe(2000);
    expect(result.expected_qty).toBe(6000);
  });

  it('should calculate variance correctly: actual 4.5kg vs expected 6kg → variance −1.5kg', () => {
    const result = calculateVariance(ingredientId, startDate.toISOString(), endDate.toISOString());
    
    // After count_correction of -1.5kg, actual = 6 - 1.5 = 4.5kg
    expect(result.actual_qty).toBe(4500);
    expect(result.variance_qty).toBe(-1500);
  });

  it('should calculate variance value correctly: −1.5kg × ₹240 = −₹360', () => {
    const result = calculateVariance(ingredientId, startDate.toISOString(), endDate.toISOString());
    
    expect(result.variance_value).toBe(-360);
  });
});
