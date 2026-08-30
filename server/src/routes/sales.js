// server/src/routes/sales.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createSaleSchema,
  saleParamsSchema,
  saleQuerySchema,
} = require('../schemas/sale.schemas');
const { saleService } = require('../services/saleService');
const { NotFoundError } = require('../utils/errors');
const { successResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/sales
 * List sales with filters
 */
router.get(
  '/',
  validate({ query: saleQuerySchema }),
  async (req, res, next) => {
    try {
      const { channel_id, payment_method, shift, from_date, to_date, sort, order, limit, offset } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (channel_id) {
        whereClause += ` AND s.channel_id = ?`;
        params.push(channel_id);
      }

      if (payment_method) {
        whereClause += ` AND s.payment_method = ?`;
        params.push(payment_method);
      }

      if (shift) {
        whereClause += ` AND s.shift = ?`;
        params.push(shift);
      }

      if (from_date) {
        whereClause += ` AND s.recorded_at >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND s.recorded_at <= ?`;
        params.push(to_date);
      }

      const orderBy = `s.${sort || 'recorded_at'} ${order || 'desc'}`;
      const limitVal = limit ? parseInt(limit, 10) : 50;
      const offsetVal = offset ? parseInt(offset, 10) : 0;

      const sales = db.prepare(`
        SELECT 
          s.id, s.sale_number, s.channel_id, c.name as channel_name,
          s.payment_method, s.shift, s.subtotal, s.tax_amount, s.total_amount,
          s.notes, s.recorded_at, s.recorded_by, u.name as recorded_by_name
        FROM sales s
        LEFT JOIN sales_channels c ON s.channel_id = c.id
        LEFT JOIN users u ON s.recorded_by = u.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limitVal, offsetVal);

      return successResponse(res, sales);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/sales/:id
 * Get sale details with items
 */
router.get(
  '/:id',
  validate({ params: saleParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const sale = db.prepare(`
        SELECT 
          s.id, s.sale_number, s.channel_id, c.name as channel_name,
          s.payment_method, s.shift, s.subtotal, s.tax_amount, s.total_amount,
          s.notes, s.recorded_at, s.recorded_by, u.name as recorded_by_name
        FROM sales s
        LEFT JOIN sales_channels c ON s.channel_id = c.id
        LEFT JOIN users u ON s.recorded_by = u.id
        WHERE s.id = ?
      `).get(id);

      if (!sale) {
        throw new NotFoundError('Sale not found');
      }

      const items = db.prepare(`
        SELECT 
          si.id, si.menu_item_id, m.name as menu_item_name,
          si.qty, si.unit_price, si.total_price
        FROM sale_items si
        LEFT JOIN menu_items m ON si.menu_item_id = m.id
        WHERE si.sale_id = ?
      `).all(id);

      sale.items = items;

      return successResponse(res, sale);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/sales
 * Record a new sale
 */
router.post(
  '/',
  validate({ body: createSaleSchema }),
  async (req, res, next) => {
    try {
      const sale = saleService.recordSale(req.body, req.user.id);

      return successResponse(res, sale);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/sales/summary
 * Get sales summary for a date range
 */
router.get(
  '/summary',
  async (req, res, next) => {
    try {
      const { from_date, to_date } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (from_date) {
        whereClause += ` AND recorded_at >= ?`;
        params.push(from_date);
      }

      if (to_date) {
        whereClause += ` AND recorded_at <= ?`;
        params.push(to_date);
      }

      const summary = db.prepare(`
        SELECT 
          COUNT(*) as total_sales,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(subtotal), 0) as total_subtotal,
          COALESCE(SUM(tax_amount), 0) as total_tax
        FROM sales
        WHERE ${whereClause}
      `).get(...params);

      const byChannel = db.prepare(`
        SELECT 
          c.name as channel_name,
          COUNT(*) as sale_count,
          COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM sales s
        LEFT JOIN sales_channels c ON s.channel_id = c.id
        WHERE ${whereClause}
        GROUP BY c.id, c.name
      `).all(...params);

      const byPaymentMethod = db.prepare(`
        SELECT 
          payment_method,
          COUNT(*) as sale_count,
          COALESCE(SUM(total_amount), 0) as total_amount
        FROM sales
        WHERE ${whereClause}
        GROUP BY payment_method
      `).all(...params);

      const byShift = db.prepare(`
        SELECT 
          shift,
          COUNT(*) as sale_count,
          COALESCE(SUM(total_amount), 0) as total_amount
        FROM sales
        WHERE ${whereClause}
        GROUP BY shift
      `).all(...params);

      return successResponse(res, {
        summary,
        by_channel: byChannel,
        by_payment_method: byPaymentMethod,
        by_shift: byShift,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/sales/missing-recipes
 * Get sales items without recipes
 */
router.get(
  '/missing-recipes',
  async (req, res, next) => {
    try {
      const missing = db.prepare(`
        SELECT DISTINCT
          m.id, m.name, m.code,
          COUNT(si.id) as sale_count
        FROM sale_items si
        JOIN menu_items m ON si.menu_item_id = m.id
        LEFT JOIN recipes r ON m.id = r.menu_item_id AND r.is_active = 1
        WHERE r.id IS NULL
        GROUP BY m.id, m.name, m.code
        ORDER BY sale_count DESC
      `).all();

      return successResponse(res, missing);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
