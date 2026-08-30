// server/src/routes/ingredients.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createIngredientSchema,
  updateIngredientSchema,
  ingredientParamsSchema,
  ingredientQuerySchema,
} = require('../schemas/ingredient.schemas');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/ingredients
 * List all ingredients with optional filtering and sorting
 */
router.get(
  '/',
  validate({ query: ingredientQuerySchema }),
  async (req, res, next) => {
    try {
      const { q, category, low_stock, expiring_days, sort, order } = req.query;

      let whereClause = 'i.is_active = 1';
      const params = [];

      if (q) {
        whereClause += ` AND (i.name LIKE ? OR i.code LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }

      if (category) {
        whereClause += ` AND c.name = ?`;
        params.push(category);
      }

      if (low_stock === 'true') {
        whereClause += ` AND i.current_stock_base <= i.reorder_point_base`;
      }

      if (expiring_days) {
        const days = parseInt(expiring_days, 10);
        whereClause += ` AND expiry_date <= date('now', '+${days} days')`;
      }

      const orderBy = `i.${sort || 'name'} ${order || 'asc'}`;

      const ingredients = db.prepare(`
        SELECT 
          i.id,
          i.code,
          i.name,
          i.category_id,
          c.name as category_name,
          i.base_unit_id,
          u.code as base_unit_code,
          i.default_location_id,
          l.name as location_name,
          i.current_cost_per_base,
          i.yield_percent,
          i.par_level_base,
          i.reorder_point_base,
          i.reorder_qty_base,
          i.shelf_life_days,
          i.is_active,
          i.created_at,
          i.updated_at
        FROM ingredients i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN units u ON i.base_unit_id = u.id
        LEFT JOIN locations l ON i.default_location_id = l.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
      `).all(...params);

      return successResponse(res, ingredients);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/ingredients
 * Create a new ingredient (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createIngredientSchema }),
  async (req, res, next) => {
    try {
      const {
        code,
        name,
        category_id,
        base_unit_id,
        default_location_id,
        current_cost_per_base,
        yield_percent,
        par_level_base,
        reorder_point_base,
        reorder_qty_base,
        shelf_life_days,
        is_active,
      } = req.body;

      // Check for duplicate code
      const existing = db.prepare('SELECT id FROM ingredients WHERE code = ?').get(code);
      if (existing) {
        throw new ValidationError('Ingredient code already exists', { code });
      }

      const result = db.prepare(`
        INSERT INTO ingredients (
          code, name, category_id, base_unit_id, default_location_id,
          current_cost_per_base, yield_percent, par_level_base,
          reorder_point_base, reorder_qty_base, shelf_life_days, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        code,
        name,
        category_id || null,
        base_unit_id,
        default_location_id || null,
        current_cost_per_base || 0,
        yield_percent || 100,
        par_level_base || 0,
        reorder_point_base || 0,
        reorder_qty_base || 0,
        shelf_life_days || 0,
        is_active ? 1 : 0
      );

      const newIngredient = db.prepare(`
        SELECT 
          i.id,
          i.code,
          i.name,
          i.category_id,
          c.name as category_name,
          i.base_unit_id,
          u.code as base_unit_code,
          i.default_location_id,
          l.name as location_name,
          i.current_cost_per_base,
          i.yield_percent,
          i.par_level_base,
          i.reorder_point_base,
          i.reorder_qty_base,
          i.shelf_life_days,
          i.is_active,
          i.created_at,
          i.updated_at
        FROM ingredients i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN units u ON i.base_unit_id = u.id
        LEFT JOIN locations l ON i.default_location_id = l.id
        WHERE i.id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newIngredient);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/ingredients/:id
 * Get a single ingredient by ID with last 30 movements
 */
router.get(
  '/:id',
  validate({ params: ingredientParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const ingredient = db.prepare(`
        SELECT 
          i.id,
          i.code,
          i.name,
          i.category_id,
          c.name as category_name,
          i.base_unit_id,
          u.code as base_unit_code,
          i.default_location_id,
          l.name as location_name,
          i.current_cost_per_base,
          i.yield_percent,
          i.par_level_base,
          i.reorder_point_base,
          i.reorder_qty_base,
          i.shelf_life_days,
          i.is_active,
          i.created_at,
          i.updated_at
        FROM ingredients i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN units u ON i.base_unit_id = u.id
        LEFT JOIN locations l ON i.default_location_id = l.id
        WHERE i.id = ?
      `).get(id);

      if (!ingredient) {
        throw new NotFoundError('Ingredient not found');
      }

      // Get last 30 movements for sparkline data
      const movements = db.prepare(`
        SELECT 
          movement_type,
          qty_base,
          unit_cost,
          total_cost,
          movement_date,
          reference_type,
          reference_id
        FROM stock_movements
        WHERE ingredient_id = ?
        ORDER BY movement_date DESC
        LIMIT 30
      `).all(id);

      // Calculate current stock from movements
      const stockResult = db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN movement_type IN ('purchase', 'transfer_in', 'opening', 'count_correction') THEN qty_base ELSE 0 END), 0) as total_in,
          COALESCE(SUM(CASE WHEN movement_type IN ('sale', 'wastage', 'transfer_out', 'count_correction') THEN ABS(qty_base) ELSE 0 END), 0) as total_out
        FROM stock_movements
        WHERE ingredient_id = ?
      `).get(id);

      const currentStock = stockResult.total_in - stockResult.total_out;

      return successResponse(res, {
        ...ingredient,
        current_stock_base: currentStock,
        movements,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/ingredients/:id
 * Update an ingredient (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: ingredientParamsSchema, body: updateIngredientSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if ingredient exists
      const existing = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(id);
      if (!existing) {
        throw new NotFoundError('Ingredient not found');
      }

      // Check for duplicate code if code is being updated
      if (updates.code) {
        const duplicate = db.prepare('SELECT id FROM ingredients WHERE code = ? AND id != ?').get(updates.code, id);
        if (duplicate) {
          throw new ValidationError('Ingredient code already exists', { code: updates.code });
        }
      }

      const setClauses = [];
      const values = [];

      const allowedFields = [
        'code', 'name', 'category_id', 'base_unit_id', 'default_location_id',
        'current_cost_per_base', 'yield_percent', 'par_level_base',
        'reorder_point_base', 'reorder_qty_base', 'shelf_life_days', 'is_active'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`
          UPDATE ingredients
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `).run(...values);
      }

      const updated = db.prepare(`
        SELECT 
          i.id,
          i.code,
          i.name,
          i.category_id,
          c.name as category_name,
          i.base_unit_id,
          u.code as base_unit_code,
          i.default_location_id,
          l.name as location_name,
          i.current_cost_per_base,
          i.yield_percent,
          i.par_level_base,
          i.reorder_point_base,
          i.reorder_qty_base,
          i.shelf_life_days,
          i.is_active,
          i.created_at,
          i.updated_at
        FROM ingredients i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN units u ON i.base_unit_id = u.id
        LEFT JOIN locations l ON i.default_location_id = l.id
        WHERE i.id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
