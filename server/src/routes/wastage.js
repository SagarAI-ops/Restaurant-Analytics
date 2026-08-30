// server/src/routes/wastage.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createWastageSchema, wastageParamsSchema, wastageQuerySchema } = require('../schemas/wastage.schemas');
const { inventoryService } = require('../services/inventoryService');
const { NotFoundError } = require('../utils/errors');
const { successResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/wastage
 * List wastage records with filters
 */
router.get(
  '/',
  validate({ query: wastageQuerySchema }),
  async (req, res, next) => {
    try {
      const { ingredient_id, reason_id, shift, from_date, to_date, sort, order, limit, offset } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (ingredient_id) {
        whereClause += ` AND sm.ingredient_id = ?`;
        params.push(ingredient_id);
      }

      if (reason_id) {
        whereClause += ` AND sm.reason_id = ?`;
        params.push(reason_id);
      }

      if (shift) {
        whereClause += ` AND sm.shift = ?`;
        params.push(shift);
      }

      if (from_date) {
        whereClause += ` AND sm.movement_date >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND sm.movement_date <= ?`;
        params.push(to_date);
      }

      const orderBy = `sm.${sort || 'movement_date'} ${order || 'desc'}`;
      const limitVal = limit ? parseInt(limit, 10) : 50;
      const offsetVal = offset ? parseInt(offset, 10) : 0;

      const wastage = db.prepare(`
        SELECT 
          sm.id, sm.ingredient_id, i.name as ingredient_name, i.code as ingredient_code,
          sm.qty_base, sm.unit_cost, sm.total_cost, sm.reason_id, r.name as reason_name,
          sm.shift, sm.notes, sm.movement_date, sm.user_id, u.name as user_name
        FROM stock_movements sm
        JOIN ingredients i ON sm.ingredient_id = i.id
        LEFT JOIN wastage_reasons r ON sm.reason_id = r.id
        LEFT JOIN users u ON sm.user_id = u.id
        WHERE sm.movement_type = 'wastage' AND ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limitVal, offsetVal);

      return successResponse(res, wastage);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/wastage
 * Record wastage (single call, no drafts)
 */
router.post(
  '/',
  validate({ body: createWastageSchema }),
  async (req, res, next) => {
    try {
      const { ingredient_id, qty, unit_id, reason_id, shift, notes } = req.body;

      // Convert qty to base unit
      const ingredient = db.prepare(`
        SELECT base_unit_id FROM ingredients WHERE id = ?
      `).get(ingredient_id);

      if (!ingredient) {
        throw new NotFoundError('Ingredient not found');
      }

      // Get conversion factor
      const conversion = db.prepare(`
        SELECT factor FROM unit_conversions 
        WHERE from_unit_id = ? AND to_unit_id = ?
      `).get(unit_id, ingredient.base_unit_id);

      const qtyBase = conversion ? qty * conversion.factor : qty;

      // Get current cost
      const ing = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(ingredient_id);
      const unitCost = ing?.current_cost_per_base || 0;
      const totalCost = qtyBase * unitCost;

      // Post wastage movement
      const movement = inventoryService.postMovement({
        ingredient_id,
        movement_type: 'wastage',
        qty_base: -qtyBase,
        unit_cost: unitCost,
        total_cost: -totalCost,
        reference_type: 'wastage',
        reason_id,
        shift: shift || 'day',
        user_id: req.user.id,
        notes,
      });

      const wastageRecord = db.prepare(`
        SELECT 
          sm.id, sm.ingredient_id, i.name as ingredient_name,
          sm.qty_base, sm.unit_cost, sm.total_cost, sm.reason_id, r.name as reason_name,
          sm.shift, sm.notes, sm.movement_date
        FROM stock_movements sm
        JOIN ingredients i ON sm.ingredient_id = i.id
        LEFT JOIN wastage_reasons r ON sm.reason_id = r.id
        WHERE sm.id = ?
      `).get(movement.id);

      return successResponse(res, wastageRecord);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/wastage/summary
 * Get wastage summary by reason, ingredient, trend, shift
 */
router.get(
  '/summary',
  async (req, res, next) => {
    try {
      const { from_date, to_date } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (from_date) {
        whereClause += ` AND movement_date >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND movement_date <= ?`;
        params.push(to_date);
      }

      const byReason = db.prepare(`
        SELECT 
          r.id as reason_id, r.name as reason_name,
          COUNT(*) as count,
          SUM(ABS(sm.qty_base)) as total_qty,
          SUM(ABS(sm.total_cost)) as total_value
        FROM stock_movements sm
        JOIN wastage_reasons r ON sm.reason_id = r.id
        WHERE sm.movement_type = 'wastage' AND ${whereClause}
        GROUP BY r.id, r.name
        ORDER BY total_value DESC
      `).all(...params);

      const byIngredient = db.prepare(`
        SELECT 
          i.id as ingredient_id, i.name as ingredient_name,
          COUNT(*) as count,
          SUM(ABS(sm.qty_base)) as total_qty,
          SUM(ABS(sm.total_cost)) as total_value
        FROM stock_movements sm
        JOIN ingredients i ON sm.ingredient_id = i.id
        WHERE sm.movement_type = 'wastage' AND ${whereClause}
        GROUP BY i.id, i.name
        ORDER BY total_value DESC
        LIMIT 20
      `).all(...params);

      const byShift = db.prepare(`
        SELECT 
          shift,
          COUNT(*) as count,
          SUM(ABS(qty_base)) as total_qty,
          SUM(ABS(total_cost)) as total_value
        FROM stock_movements
        WHERE movement_type = 'wastage' AND ${whereClause}
        GROUP BY shift
        ORDER BY total_value DESC
      `).all(...params);

      const trend = db.prepare(`
        SELECT 
          DATE(movement_date) as date,
          COUNT(*) as count,
          SUM(ABS(qty_base)) as total_qty,
          SUM(ABS(total_cost)) as total_value
        FROM stock_movements
        WHERE movement_type = 'wastage' AND ${whereClause}
        GROUP BY DATE(movement_date)
        ORDER BY date DESC
        LIMIT 30
      `).all(...params);

      return successResponse(res, {
        by_reason: byReason,
        by_ingredient: byIngredient,
        by_shift: byShift,
        trend,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
