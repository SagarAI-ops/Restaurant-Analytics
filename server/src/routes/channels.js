// server/src/routes/channels.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createChannelSchema,
  updateChannelSchema,
  channelParamsSchema,
  channelQuerySchema,
} = require('../schemas/channel.schemas');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/channels
 * List all sales channels with optional filtering and sorting
 */
router.get(
  '/',
  validate({ query: channelQuerySchema }),
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

      const channels = db.prepare(`
        SELECT 
          id, name, commission_percent, is_active, created_at, updated_at
        FROM sales_channels
        WHERE ${whereClause}
        ORDER BY ${orderBy}
      `).all(...params);

      return successResponse(res, channels);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/channels
 * Create a new sales channel (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createChannelSchema }),
  async (req, res, next) => {
    try {
      const { name, commission_percent, is_active } = req.body;

      // Check for duplicate name
      const existing = db.prepare('SELECT id FROM sales_channels WHERE name = ?').get(name);
      if (existing) {
        throw new ValidationError('Channel name already exists', { name });
      }

      const result = db.prepare(`
        INSERT INTO sales_channels (name, commission_percent, is_active)
        VALUES (?, ?, ?)
      `).run(name, commission_percent || 0, is_active ? 1 : 0);

      const newChannel = db.prepare(`
        SELECT 
          id, name, commission_percent, is_active, created_at, updated_at
        FROM sales_channels
        WHERE id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newChannel);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/channels/:id
 * Update a sales channel (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: channelParamsSchema, body: updateChannelSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if channel exists
      const existing = db.prepare('SELECT id FROM sales_channels WHERE id = ?').get(id);
      if (!existing) {
        throw new NotFoundError('Channel not found');
      }

      // Check for duplicate name if name is being updated
      if (updates.name) {
        const duplicate = db.prepare('SELECT id FROM sales_channels WHERE name = ? AND id != ?').get(updates.name, id);
        if (duplicate) {
          throw new ValidationError('Channel name already exists', { name: updates.name });
        }
      }

      const setClauses = [];
      const values = [];

      const allowedFields = ['name', 'commission_percent', 'is_active'];

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
          UPDATE sales_channels
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `).run(...values);
      }

      const updated = db.prepare(`
        SELECT 
          id, name, commission_percent, is_active, created_at, updated_at
        FROM sales_channels
        WHERE id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
