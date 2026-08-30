// server/src/routes/suppliers.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createSupplierSchema,
  updateSupplierSchema,
  supplierParamsSchema,
  supplierQuerySchema,
  supplierPriceChangesQuerySchema,
} = require('../schemas/supplier.schemas');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/suppliers
 * List all suppliers with optional filtering and sorting
 */
router.get(
  '/',
  validate({ query: supplierQuerySchema }),
  async (req, res, next) => {
    try {
      const { q, is_active, sort, order } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (q) {
        whereClause += ` AND (name LIKE ? OR code LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }

      if (is_active !== undefined) {
        whereClause += ` AND is_active = ?`;
        params.push(is_active === 'true' ? 1 : 0);
      }

      const orderBy = `${sort || 'name'} ${order || 'asc'}`;

      const suppliers = db.prepare(`
        SELECT 
          id, name, code, contact_person, email, phone,
          lead_time_days, min_order_value, payment_terms, rating,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE ${whereClause}
        ORDER BY ${orderBy}
      `).all(...params);

      return successResponse(res, suppliers);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/suppliers
 * Create a new supplier (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createSupplierSchema }),
  async (req, res, next) => {
    try {
      const {
        name,
        code,
        contact_person,
        email,
        phone,
        lead_time_days,
        min_order_value,
        payment_terms,
        rating,
        is_active,
      } = req.body;

      // Check for duplicate code
      const existing = db.prepare('SELECT id FROM suppliers WHERE code = ?').get(code);
      if (existing) {
        throw new ValidationError('Supplier code already exists', { code });
      }

      const result = db.prepare(`
        INSERT INTO suppliers (
          name, code, contact_person, email, phone,
          lead_time_days, min_order_value, payment_terms, rating, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        code,
        contact_person || null,
        email || null,
        phone || null,
        lead_time_days || 1,
        min_order_value || 0,
        payment_terms || null,
        rating !== undefined ? rating : 5,
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      );

      const newSupplier = db.prepare(`
        SELECT 
          id, name, code, contact_person, email, phone,
          lead_time_days, min_order_value, payment_terms, rating,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newSupplier);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/suppliers/:id
 * Get a single supplier by ID
 */
router.get(
  '/:id',
  validate({ params: supplierParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const supplier = db.prepare(`
        SELECT 
          id, name, code, contact_person, email, phone,
          lead_time_days, min_order_value, payment_terms, rating,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE id = ?
      `).get(id);

      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }

      return successResponse(res, supplier);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/suppliers/:id
 * Update a supplier (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: supplierParamsSchema, body: updateSupplierSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if supplier exists
      const existing = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
      if (!existing) {
        throw new NotFoundError('Supplier not found');
      }

      // Check for duplicate code if code is being updated
      if (updates.code) {
        const duplicate = db.prepare('SELECT id FROM suppliers WHERE code = ? AND id != ?').get(updates.code, id);
        if (duplicate) {
          throw new ValidationError('Supplier code already exists', { code: updates.code });
        }
      }

      const setClauses = [];
      const values = [];

      const allowedFields = [
        'name', 'code', 'contact_person', 'email', 'phone',
        'lead_time_days', 'min_order_value', 'payment_terms', 'rating', 'is_active'
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
          UPDATE suppliers
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `).run(...values);
      }

      const updated = db.prepare(`
        SELECT 
          id, name, code, contact_person, email, phone,
          lead_time_days, min_order_value, payment_terms, rating,
          is_active, created_at, updated_at
        FROM suppliers
        WHERE id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/suppliers/:id/price-changes
 * Get price changes for a supplier's ingredients
 */
router.get(
  '/:id/price-changes',
  validate({ params: supplierParamsSchema, query: supplierPriceChangesQuerySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { days } = req.query;

      // Check if supplier exists
      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }

      const priceChanges = db.prepare(`
        SELECT 
          sp.id,
          sp.supplier_id,
          s.name as supplier_name,
          sp.ingredient_id,
          i.name as ingredient_name,
          i.code as ingredient_code,
          sp.purchase_unit_id,
          u.code as purchase_unit_code,
          sp.price_per_purchase_unit,
          sp.effective_date,
          sp.created_at
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        JOIN ingredients i ON sp.ingredient_id = i.id
        JOIN units u ON sp.purchase_unit_id = u.id
        WHERE sp.supplier_id = ?
          AND sp.effective_date >= date('now', '-' || ? || ' days')
        ORDER BY sp.effective_date DESC, i.name
      `).all(id, days);

      return successResponse(res, priceChanges);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
