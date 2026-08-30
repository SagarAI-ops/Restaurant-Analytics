// server/src/routes/counts.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createCountSchema,
  updateCountItemsSchema,
  completeCountSchema,
  countParamsSchema,
  countQuerySchema,
} = require('../schemas/count.schemas');
const { inventoryService } = require('../services/inventoryService');
const { varianceService } = require('../services/varianceService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/counts
 * List stock counts with filters
 */
router.get(
  '/',
  validate({ query: countQuerySchema }),
  async (req, res, next) => {
    try {
      const { status, location_id, from_date, to_date, sort, order, limit, offset } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (status) {
        whereClause += ` AND c.status = ?`;
        params.push(status);
      }

      if (location_id) {
        whereClause += ` AND c.location_id = ?`;
        params.push(location_id);
      }

      if (from_date) {
        whereClause += ` AND c.created_at >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND c.created_at <= ?`;
        params.push(to_date);
      }

      const orderBy = `c.${sort || 'created_at'} ${order || 'desc'}`;
      const limitVal = limit ? parseInt(limit, 10) : 50;
      const offsetVal = offset ? parseInt(offset, 10) : 0;

      const counts = db.prepare(`
        SELECT 
          c.id, c.count_number, c.name, c.location_id, l.name as location_name,
          c.category_id, cat.name as category_name,
          c.status, c.notes, c.created_at, c.completed_at, c.created_by, u.name as created_by_name
        FROM counts c
        LEFT JOIN locations l ON c.location_id = l.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.created_by = u.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limitVal, offsetVal);

      return successResponse(res, counts);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/counts
 * Create a new stock count (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createCountSchema }),
  async (req, res, next) => {
    try {
      const { name, location_id, category_id, notes } = req.body;

      const result = db.prepare(`
        INSERT INTO counts (count_number, name, location_id, category_id, status, notes, created_by)
        VALUES (
          'CNT-' || strftime('%Y%m%d-%H%M%S', 'now') || '-' || printf('%03d', COALESCE((SELECT MAX(id) FROM counts), 0) + 1),
          ?, ?, ?, 'open', ?, ?
        )
      `).run(name, location_id || null, category_id || null, notes || null, req.user.id);

      const countId = result.lastInsertRowid;

      // Get expected stock snapshot for items in scope
      let whereClause = 'i.is_active = 1';
      const whereParams = [];

      if (location_id) {
        // For now, just get all active ingredients - location filtering would need more complex logic
      }

      if (category_id) {
        whereClause += ` AND i.category_id = ?`;
        whereParams.push(category_id);
      }

      const ingredients = db.prepare(`
        SELECT 
          i.id, i.name, i.code, i.base_unit_id, u.code as base_unit_code,
          (
            SELECT COALESCE(SUM(CASE WHEN sm.movement_type IN ('purchase', 'transfer_in', 'opening', 'count_correction') THEN sm.qty_base ELSE 0 END), 0) -
                   COALESCE(SUM(CASE WHEN sm.movement_type IN ('sale', 'wastage', 'transfer_out', 'count_correction') THEN ABS(sm.qty_base) ELSE 0 END), 0)
            FROM stock_movements sm
            WHERE sm.ingredient_id = i.id
          ) as expected_qty_base
        FROM ingredients i
        JOIN units u ON i.base_unit_id = u.id
        WHERE ${whereClause}
      `).all(...whereParams);

      const newCount = db.prepare(`
        SELECT 
          c.id, c.count_number, c.name, c.location_id, l.name as location_name,
          c.category_id, cat.name as category_name,
          c.status, c.notes, c.created_at
        FROM counts c
        LEFT JOIN locations l ON c.location_id = l.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.id = ?
      `).get(countId);

      newCount.expected_items = ingredients;

      return createdResponse(res, newCount);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/counts/:id
 * Get count details with items
 */
router.get(
  '/:id',
  validate({ params: countParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const count = db.prepare(`
        SELECT 
          c.id, c.count_number, c.name, c.location_id, l.name as location_name,
          c.category_id, cat.name as category_name,
          c.status, c.notes, c.created_at, c.completed_at, c.created_by, u.name as created_by_name
        FROM counts c
        LEFT JOIN locations l ON c.location_id = l.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.id = ?
      `).get(id);

      if (!count) {
        throw new NotFoundError('Count not found');
      }

      const items = db.prepare(`
        SELECT 
          ci.id, ci.ingredient_id, i.name as ingredient_name, i.code as ingredient_code,
          ci.expected_qty_base, ci.actual_qty_base, ci.unit_id, u.code as unit_code,
          ci.variance_qty_base, ci.variance_value, ci.reason_text,
          ci.counted_at, ci.counted_by, cu.name as counted_by_name
        FROM count_items ci
        JOIN ingredients i ON ci.ingredient_id = i.id
        JOIN units u ON ci.unit_id = u.id
        LEFT JOIN users cu ON ci.counted_by = cu.id
        WHERE ci.count_id = ?
        ORDER BY i.name
      `).all(id);

      count.items = items;

      return successResponse(res, count);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/counts/:id/items
 * Update count items (admin/manager only)
 */
router.put(
  '/:id/items',
  requireRole(['admin', 'manager']),
  validate({ params: countParamsSchema, body: updateCountItemsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { items } = req.body;

      const count = db.prepare('SELECT status FROM counts WHERE id = ?').get(id);
      if (!count) {
        throw new NotFoundError('Count not found');
      }

      if (count.status !== 'open') {
        throw new ValidationError('Can only update items for open counts');
      }

      const updateItems = db.transaction(() => {
        // Clear existing items
        db.prepare('DELETE FROM count_items WHERE count_id = ?').run(id);

        // Insert new items
        const insertItem = db.prepare(`
          INSERT INTO count_items (count_id, ingredient_id, actual_qty_base, unit_id, reason_text, counted_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          // Convert actual_qty to base
          const ingredient = db.prepare(`
            SELECT base_unit_id FROM ingredients WHERE id = ?
          `).get(item.ingredient_id);

          if (!ingredient) {
            throw new NotFoundError(`Ingredient ${item.ingredient_id} not found`);
          }

          // For simplicity, assume actual_qty is already in base units or use conversion
          const actualQtyBase = item.actual_qty;

          insertItem.run(id, item.ingredient_id, actualQtyBase, item.unit_id, item.reason_text || null, req.user.id);
        }
      });

      updateItems();

      const updated = db.prepare(`
        SELECT 
          c.id, c.count_number, c.name, c.status, c.updated_at
        FROM counts c
        WHERE c.id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/counts/:id/complete
 * Complete a count and post correction movements (admin/manager only)
 */
router.post(
  '/:id/complete',
  requireRole(['admin', 'manager']),
  validate({ params: countParamsSchema, body: completeCountSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const count = db.prepare(`
        SELECT c.id, c.location_id, c.category_id FROM counts c WHERE c.id = ?
      `).get(id);

      if (!count) {
        throw new NotFoundError('Count not found');
      }

      const completeCount = db.transaction(() => {
        // Get count items
        const items = db.prepare(`
          SELECT 
            ci.ingredient_id, ci.expected_qty_base, ci.actual_qty_base, ci.reason_text
          FROM count_items ci
          WHERE ci.count_id = ?
        `).all(id);

        // Validate variances have reasons
        for (const item of items) {
          const variance = item.actual_qty_base - item.expected_qty_base;
          const threshold = 0.05; // 5% threshold

          if (Math.abs(variance) > Math.abs(item.expected_qty_base) * threshold && !item.reason_text) {
            throw new ValidationError(
              `Ingredient ${item.ingredient_id} has variance above threshold but no reason provided`
            );
          }
        }

        // Post count_correction movements
        for (const item of items) {
          const variance = item.actual_qty_base - item.expected_qty_base;

          if (variance !== 0) {
            const ingredient = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(item.ingredient_id);
            const unitCost = ingredient?.current_cost_per_base || 0;

            inventoryService.postMovement({
              ingredient_id: item.ingredient_id,
              movement_type: 'count_correction',
              qty_base: variance,
              unit_cost: unitCost,
              total_cost: variance * unitCost,
              reference_type: 'count',
              reference_id: id,
              user_id: req.user.id,
              notes: item.reason_text || `Stock count adjustment`,
            });
          }
        }

        // Update count status
        db.prepare(`
          UPDATE counts SET status = 'completed', completed_at = CURRENT_TIMESTAMP, notes = ?
          WHERE id = ?
        `).run(notes || count.notes, id);
      });

      completeCount();

      const completed = db.prepare(`
        SELECT 
          c.id, c.count_number, c.name, c.status, c.completed_at, c.notes
        FROM counts c
        WHERE c.id = ?
      `).get(id);

      return successResponse(res, completed);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
