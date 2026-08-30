// server/src/routes/transfers.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createTransferSchema, transferParamsSchema, transferQuerySchema } = require('../schemas/transfer.schemas');
const { inventoryService } = require('../services/inventoryService');
const { NotFoundError } = require('../utils/errors');
const { successResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/transfers
 * List transfers with filters
 */
router.get(
  '/',
  validate({ query: transferQuerySchema }),
  async (req, res, next) => {
    try {
      const { from_location_id, to_location_id, from_date, to_date, sort, order, limit, offset } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (from_location_id) {
        whereClause += ` AND from_location_id = ?`;
        params.push(from_location_id);
      }

      if (to_location_id) {
        whereClause += ` AND to_location_id = ?`;
        params.push(to_location_id);
      }

      if (from_date) {
        whereClause += ` AND created_at >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND created_at <= ?`;
        params.push(to_date);
      }

      const orderBy = `${sort || 'created_at'} ${order || 'desc'}`;
      const limitVal = limit ? parseInt(limit, 10) : 50;
      const offsetVal = offset ? parseInt(offset, 10) : 0;

      const transfers = db.prepare(`
        SELECT 
          t.id, t.transfer_number, t.from_location_id, fl.name as from_location_name,
          t.to_location_id, tl.name as to_location_name,
          t.status, t.notes, t.created_at, t.completed_at, t.created_by, u.name as created_by_name
        FROM transfers t
        JOIN locations fl ON t.from_location_id = fl.id
        JOIN locations tl ON t.to_location_id = tl.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limitVal, offsetVal);

      return successResponse(res, transfers);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/transfers
 * Create a transfer (paired transfer_out/transfer_in movements)
 */
router.post(
  '/',
  validate({ body: createTransferSchema }),
  async (req, res, next) => {
    try {
      const { from_location_id, to_location_id, items, notes } = req.body;

      // Validate locations exist
      const fromLoc = db.prepare('SELECT id FROM locations WHERE id = ?').get(from_location_id);
      const toLoc = db.prepare('SELECT id FROM locations WHERE id = ?').get(to_location_id);

      if (!fromLoc || !toLoc) {
        throw new NotFoundError('One or both locations not found');
      }

      const createTransfer = db.transaction(() => {
        // Insert transfer header
        const result = db.prepare(`
          INSERT INTO transfers (from_location_id, to_location_id, status, notes, created_by)
          VALUES (?, ?, 'completed', ?, ?)
        `).run(from_location_id, to_location_id, notes || null, req.user.id);

        const transferId = result.lastInsertRowid;

        // Process each item: create paired movements
        const insertItem = db.prepare(`
          INSERT INTO transfer_items (transfer_id, ingredient_id, qty, unit_id, qty_base, unit_cost, total_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          // Convert qty to base
          const ingredient = db.prepare(`
            SELECT base_unit_id, current_cost_per_base FROM ingredients WHERE id = ?
          `).get(item.ingredient_id);

          if (!ingredient) {
            throw new NotFoundError(`Ingredient ${item.ingredient_id} not found`);
          }

          const conversion = db.prepare(`
            SELECT factor FROM unit_conversions 
            WHERE from_unit_id = ? AND to_unit_id = ?
          `).get(item.unit_id, ingredient.base_unit_id);

          const qtyBase = conversion ? item.qty * conversion.factor : item.qty;
          const unitCost = ingredient.current_cost_per_base || 0;
          const totalCost = qtyBase * unitCost;

          // Insert transfer item
          insertItem.run(transferId, item.ingredient_id, item.qty, item.unit_id, qtyBase, unitCost, totalCost);

          // Post transfer_out movement at from_location
          inventoryService.postMovement({
            ingredient_id: item.ingredient_id,
            movement_type: 'transfer_out',
            qty_base: -qtyBase,
            unit_cost: unitCost,
            total_cost: -totalCost,
            reference_type: 'transfer',
            reference_id: transferId,
            location_id: from_location_id,
            user_id: req.user.id,
            notes: `Transfer to ${toLoc.name}`,
          });

          // Post transfer_in movement at to_location
          inventoryService.postMovement({
            ingredient_id: item.ingredient_id,
            movement_type: 'transfer_in',
            qty_base: qtyBase,
            unit_cost: unitCost,
            total_cost: totalCost,
            reference_type: 'transfer',
            reference_id: transferId,
            location_id: to_location_id,
            user_id: req.user.id,
            notes: `Transfer from ${fromLoc.name}`,
          });
        }

        return transferId;
      });

      const transferId = createTransfer();

      const transfer = db.prepare(`
        SELECT 
          t.id, t.transfer_number, t.from_location_id, fl.name as from_location_name,
          t.to_location_id, tl.name as to_location_name,
          t.status, t.notes, t.created_at
        FROM transfers t
        JOIN locations fl ON t.from_location_id = fl.id
        JOIN locations tl ON t.to_location_id = tl.id
        WHERE t.id = ?
      `).get(transferId);

      transfer.items = items;

      return successResponse(res, transfer);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
