// server/tests/costingService.test.js

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { updateWMA, getCurrentCost, getStockValue } from '../src/services/costingService.js';
import db from '../src/db.js';

describe('costingService', () => {
  let ingredientId;

  beforeAll(() => {
    // Create test ingredient
    const baseUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('g');
    const result = db.prepare(`
      INSERT INTO ingredients (code, name, base_unit_id, is_active)
      VALUES ('TEST_WMA', 'Test WMA Ingredient', ?, 1)
    `).run(baseUnit.id);
    ingredientId = result.lastInsertRowid;
  });

  afterAll(() => {
    // Clean up test data
    db.prepare('DELETE FROM stock_movements WHERE ingredient_id = ?').run(ingredientId);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(ingredientId);
  });

  it('should calculate WMA correctly: buy 10kg@₹200 → avg 200', () => {
    // First purchase: 10000g @ ₹200/g = ₹2000000
    const qtyBase = 10000; // 10kg in grams
    const totalCost = 2000000; // ₹2000000
    
    const newAvg = updateWMA(ingredientId, qtyBase, totalCost);
    expect(newAvg).toBe(200);
    
    const currentCost = getCurrentCost(ingredientId);
    expect(currentCost).toBe(200);
  });

  it('should update WMA: buy 20kg@₹245 → avg ₹230', () => {
    // Second purchase: 20000g @ ₹245/g = ₹4900000
    const qtyBase = 20000; // 20kg in grams
    const totalCost = 4900000; // ₹4900000
    
    // Previous: 10000g @ ₹200 = ₹2000000
    // New: 20000g @ ₹245 = ₹4900000
    // Total: 30000g, ₹6900000
    // WMA: 6900000 / 30000 = ₹230
    
    // First ensure we have the first purchase recorded
    db.prepare(`
      INSERT INTO stock_movements (ingredient_id, movement_type, qty_base, unit_cost, total_cost, movement_date)
      VALUES (?, 'purchase', 10000, 200, 2000000, date('now'))
    `).run(ingredientId);
    
    // Update WMA with first purchase
    updateWMA(ingredientId, 10000, 2000000);
    
    // Now second purchase
    const newAvg = updateWMA(ingredientId, qtyBase, totalCost);
    expect(newAvg).toBe(230);
  });

  it('should track stock value correctly after purchases', () => {
    // After two purchases: 30000g, ₹6900000
    const { qty, value } = getStockValue(ingredientId);
    expect(qty).toBe(30000);
    expect(value).toBe(6900000);
  });
});
