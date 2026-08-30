// server/src/routes/purchases.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseParamsSchema,
  purchaseQuerySchema,
} = require('../schemas/purchase.schemas');
const { purchaseService } = require('../services/purchaseService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/purchases
 * List purchases with filters
 */
router.get(
  '/',
  validate({ query: purchaseQuerySchema }),
  async (req, res, next) => {
    try {
      const { status, supplier_id, from_date, to_date, sort, order, limit, offset } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (status) {
        whereClause += ` AND p.status = ?`;
        params.push(status);
      }

      if (supplier_id) {
        whereClause += ` AND p.supplier_id = ?`;
        params.push(supplier_id);
      }

      if (from_date) {
        whereClause += ` AND p.created_at >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND p.created_at <= ?`;
        params.push(to_date);
      }

      const orderBy = `p.${sort || 'created_at'} ${order || 'desc'}`;
      const limitVal = limit ? parseInt(limit, 10) : 50;
      const offsetVal = offset ? parseInt(offset, 10) : 0;

      const purchases = db.prepare(`
        SELECT 
          p.id, p.purchase_number, p.supplier_id, s.name as supplier_name,
          p.invoice_number, p.status, p.subtotal, p.tax_amount,
          p.discount_amount, p.total_amount, p.notes,
          p.created_at, p.confirmed_at, p.voided_at
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limitVal, offsetVal);

      return successResponse(res, purchases);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/purchases/:id
 * Get purchase details with items
 */
router.get(
  '/:id',
  validate({ params: purchaseParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const purchase = db.prepare(`
        SELECT 
          p.id, p.purchase_number, p.supplier_id, s.name as supplier_name,
          p.invoice_number, p.status, p.subtotal, p.tax_amount,
          p.discount_amount, p.total_amount, p.notes,
          p.created_at, p.confirmed_at, p.voided_at
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
      `).get(id);

      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      const items = db.prepare(`
        SELECT 
          pi.id, pi.ingredient_id, i.name as ingredient_name, i.code as ingredient_code,
          pi.qty, pi.unit_id, u.code as unit_code,
          pi.qty_base, pi.unit_cost, pi.total_cost, pi.expiry_date
        FROM purchase_items pi
        JOIN ingredients i ON pi.ingredient_id = i.id
        JOIN units u ON pi.unit_id = u.id
        WHERE pi.purchase_id = ?
      `).all(id);

      purchase.items = items;

      return successResponse(res, purchase);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/purchases
 * Create a draft purchase (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createPurchaseSchema }),
  async (req, res, next) => {
    try {
      const { supplier_id, invoice_number, items, notes } = req.body;

      const insertPurchase = db.transaction(() => {
        // Insert purchase
        const result = db.prepare(`
          INSERT INTO purchases (supplier_id, invoice_number, status, notes, created_by)
          VALUES (?, ?, 'draft', ?, ?)
        `).run(supplier_id, invoice_number || null, notes || null, req.user.id);

        const purchaseId = result.lastInsertRowid;

        // Insert purchase items
        const insertItem = db.prepare(`
          INSERT INTO purchase_items (purchase_id, ingredient_id, qty, unit_id, qty_base, unit_cost, total_cost, expiry_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let subtotal = 0;

        for (const item of items) {
          // Convert qty to base
          const conversion = db.prepare(`
            SELECT factor FROM unit_conversions 
            WHERE from_unit_id = ? AND to_unit_id = (
              SELECT base_unit_id FROM ingredients WHERE id = ?
            )
          `).get(item.unit_id, item.ingredient_id);

          const qtyBase = conversion ? item.qty * conversion.factor : item.qty;
          const totalCost = qtyBase * item.unit_cost;
          subtotal += totalCost;

          insertItem.run(
            purchaseId,
            item.ingredient_id,
            item.qty,
            item.unit_id,
            qtyBase,
            item.unit_cost,
            totalCost,
            item.expiry_date || null
          );
        }

        // Update totals
        const taxAmount = subtotal * 0.18;
        const totalAmount = subtotal + taxAmount;

        db.prepare(`
          UPDATE purchases SET subtotal = ?, tax_amount = ?, total_amount = ?
          WHERE id = ?
        `).run(subtotal, taxAmount, totalAmount, purchaseId);

        return purchaseId;
      });

      const purchaseId = insertPurchase();

      const newPurchase = db.prepare(`
        SELECT 
          p.id, p.purchase_number, p.supplier_id, s.name as supplier_name,
          p.invoice_number, p.status, p.subtotal, p.tax_amount,
          p.discount_amount, p.total_amount, p.notes, p.created_at
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
      `).get(purchaseId);

      newPurchase.items = items;

      return createdResponse(res, newPurchase);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/purchases/:id
 * Update a draft purchase (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: purchaseParamsSchema, body: updatePurchaseSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const purchase = db.prepare('SELECT status FROM purchases WHERE id = ?').get(id);
      if (!purchase) {
        throw new NotFoundError('Purchase not found');
      }

      if (purchase.status !== 'draft') {
        throw new ValidationError('Can only update draft purchases');
      }

      // Update purchase header if needed
      if (updates.supplier_id || updates.invoice_number || updates.notes) {
        db.prepare(`
          UPDATE purchases
          SET supplier_id = COALESCE(?, supplier_id),
              invoice_number = COALESCE(?, invoice_number),
              notes = COALESCE(?, notes)
          WHERE id = ?
        `).run(updates.supplier_id, updates.invoice_number, updates.notes, id);
      }

      // TODO: Handle item updates if needed

      const updated = db.prepare(`
        SELECT 
          p.id, p.purchase_number, p.supplier_id, s.name as supplier_name,
          p.invoice_number, p.status, p.subtotal, p.tax_amount,
          p.discount_amount, p.total_amount, p.notes, p.updated_at
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/purchases/:id/confirm
 * Confirm a purchase (admin/manager only)
 */
router.post(
  '/:id/confirm',
  requireRole(['admin', 'manager']),
  validate({ params: purchaseParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const confirmed = purchaseService.confirmPurchase(id, req.user.id);

      return successResponse(res, confirmed);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/purchases/:id/void
 * Void a confirmed purchase (admin/manager only)
 */
router.post(
  '/:id/void',
  requireRole(['admin', 'manager']),
  validate({ params: purchaseParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const voided = purchaseService.voidPurchase(id, req.user.id);

      return successResponse(res, voided);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
