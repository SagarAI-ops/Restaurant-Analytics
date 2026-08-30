// server/tests/conversionService.test.js

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { convert, describeConversion } from '../src/services/conversionService.js';
import db from '../src/db.js';

describe('conversionService', () => {
  beforeAll(() => {
    // Ensure test data exists
    db.exec(`
      INSERT OR IGNORE INTO units (code, name, dimension, is_base) VALUES ('ml', 'Milliliter', 'volume', 1);
      INSERT OR IGNORE INTO units (code, name, dimension, is_base) VALUES ('l', 'Liter', 'volume', 0);
      INSERT OR IGNORE INTO units (code, name, dimension, is_base) VALUES ('g', 'Gram', 'weight', 1);
      INSERT OR IGNORE INTO units (code, name, dimension, is_base) VALUES ('kg', 'Kilogram', 'weight', 0);
      INSERT OR IGNORE INTO units (code, name, dimension, is_base) VALUES ('carton', 'Carton', 'count', 0);
      
      INSERT OR IGNORE INTO unit_conversions (from_unit_id, to_unit_id, factor, ingredient_id) 
      SELECT u1.id, u2.id, 1000, NULL FROM units u1, units u2 WHERE u1.code='l' AND u2.code='ml';
      
      INSERT OR IGNORE INTO unit_conversions (from_unit_id, to_unit_id, factor, ingredient_id) 
      SELECT u1.id, u2.id, 1000, NULL FROM units u1, units u2 WHERE u1.code='kg' AND u2.code='g';
    `);
    
    // Insert carton->carton conversion for count dimension (same unit)
    const cartonUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('carton');
    if (cartonUnit) {
      db.prepare(`
        INSERT OR IGNORE INTO unit_conversions (from_unit_id, to_unit_id, factor, ingredient_id)
        VALUES (?, ?, 1, NULL)
      `).run(cartonUnit.id, cartonUnit.id);
    }
  });

  afterAll(() => {
    // Clean up test data
    db.exec(`DELETE FROM unit_conversions WHERE factor IN (1000, 1);`);
    db.exec(`DELETE FROM units WHERE code IN ('carton');`);
  });

  it('should convert carton to ml (1 carton = 12000 ml)', () => {
    // Create carton->ml conversion for this specific test
    const cartonUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('carton');
    const mlUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('ml');
    
    // Insert the specific conversion - note: carton is 'count' dimension, ml is 'volume'
    // This is an ingredient-specific conversion (e.g., milk carton), so we need an ingredient
    const baseUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('ml');
    const ingResult = db.prepare(`
      INSERT INTO ingredients (code, name, base_unit_id, is_active)
      VALUES ('TEST_MILK', 'Test Milk', ?, 1)
    `).run(baseUnit.id);
    const ingredientId = ingResult.lastInsertRowid;
    
    // Insert ingredient-specific conversion: 1 carton = 12000 ml for this ingredient
    db.prepare(`
      INSERT OR REPLACE INTO unit_conversions (from_unit_id, to_unit_id, factor, ingredient_id)
      VALUES (?, ?, 12000, ?)
    `).run(cartonUnit.id, mlUnit.id, ingredientId);
    
    const result = convert(1, cartonUnit.id, mlUnit.id, ingredientId);
    expect(result).toBe(12000);
    
    // Clean up
    db.prepare(`DELETE FROM unit_conversions WHERE from_unit_id = ? AND to_unit_id = ? AND factor = 12000`)
      .run(cartonUnit.id, mlUnit.id);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(ingredientId);
  });

  it('should convert 2.5 kg to g (2.5 kg = 2500 g)', () => {
    const kgUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('kg');
    const gUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('g');
    
    const result = convert(2.5, kgUnit.id, gUnit.id);
    expect(result).toBe(2500);
  });

  it('should throw UNIT_DIMENSION_MISMATCH when converting carton to g', () => {
    const cartonUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('carton');
    const gUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('g');
    
    // carton (count) and g (weight) are different dimensions - should throw
    expect(() => convert(1, cartonUnit.id, gUnit.id)).toThrow('UNIT_DIMENSION_MISMATCH');
  });

  it('should convert within same dimension: carton to carton (identity)', () => {
    const cartonUnit = db.prepare('SELECT id FROM units WHERE code = ?').get('carton');
    
    const result = convert(5, cartonUnit.id, cartonUnit.id);
    expect(result).toBe(5);
  });
});
