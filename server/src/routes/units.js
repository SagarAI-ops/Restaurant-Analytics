// server/src/routes/units.js

const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createUnitSchema,
  updateUnitSchema,
  unitParamsSchema,
  unitQuerySchema,
  createConversionSchema,
  convertQuantitySchema,
} = require('../schemas/unit.schemas');
const { conversionService } = require('../services/conversionService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/units
 * List all units with optional filtering and sorting
 */
router.get(
  '/',
  validate({ query: unitQuerySchema }),
  async (req, res, next) => {
    try {
      const { dimension, is_base, sort, order } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (dimension) {
        whereClause += ` AND dimension = ?`;
        params.push(dimension);
      }

      if (is_base !== undefined) {
        whereClause += ` AND is_base = ?`;
        params.push(is_base ? 1 : 0);
      }

      const orderBy = `${sort || 'code'} ${order || 'asc'}`;

      const units = db.prepare(`
        SELECT id, code, name, dimension, is_base, created_at
        FROM units
        WHERE ${whereClause}
        ORDER BY ${orderBy}
      `).all(...params);

      return successResponse(res, units);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/units
 * Create a new unit (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createUnitSchema }),
  async (req, res, next) => {
    try {
      const { code, name, dimension, is_base } = req.body;

      // Check for duplicate code
      const existing = db.prepare('SELECT id FROM units WHERE code = ?').get(code);
      if (existing) {
        throw new ValidationError('Unit code already exists', { code });
      }

      const result = db.prepare(`
        INSERT INTO units (code, name, dimension, is_base)
        VALUES (?, ?, ?, ?)
      `).run(code, name, dimension, is_base ? 1 : 0);

      const newUnit = db.prepare(`
        SELECT id, code, name, dimension, is_base, created_at
        FROM units
        WHERE id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newUnit);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/units/:id
 * Get a single unit by ID
 */
router.get(
  '/:id',
  validate({ params: unitParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const unit = db.prepare(`
        SELECT id, code, name, dimension, is_base, created_at
        FROM units
        WHERE id = ?
      `).get(id);

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      return successResponse(res, unit);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/units/:id
 * Update a unit (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: unitParamsSchema, body: updateUnitSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { code, name, dimension, is_base } = req.body;

      // Check if unit exists
      const existing = db.prepare('SELECT id FROM units WHERE id = ?').get(id);
      if (!existing) {
        throw new NotFoundError('Unit not found');
      }

      // Check for duplicate code if code is being updated
      if (code) {
        const duplicate = db.prepare('SELECT id FROM units WHERE code = ? AND id != ?').get(code, id);
        if (duplicate) {
          throw new ValidationError('Unit code already exists', { code });
        }
      }

      const updates = [];
      const values = [];

      if (code !== undefined) {
        updates.push('code = ?');
        values.push(code);
      }
      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (dimension !== undefined) {
        updates.push('dimension = ?');
        values.push(dimension);
      }
      if (is_base !== undefined) {
        updates.push('is_base = ?');
        values.push(is_base ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`
          UPDATE units
          SET ${updates.join(', ')}
          WHERE id = ?
        `).run(...values);
      }

      const updated = db.prepare(`
        SELECT id, code, name, dimension, is_base, created_at, updated_at
        FROM units
        WHERE id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/units/conversions
 * List all unit conversions
 */
router.get(
  '/conversions',
  async (req, res, next) => {
    try {
      const conversions = db.prepare(`
        SELECT 
          uc.id,
          uc.from_unit_id,
          fu.code as from_code,
          fu.name as from_name,
          uc.to_unit_id,
          tu.code as to_code,
          tu.name as to_name,
          uc.factor,
          uc.ingredient_id,
          i.name as ingredient_name,
          uc.created_at
        FROM unit_conversions uc
        JOIN units fu ON uc.from_unit_id = fu.id
        JOIN units tu ON uc.to_unit_id = tu.id
        LEFT JOIN ingredients i ON uc.ingredient_id = i.id
        ORDER BY fu.code, tu.code
      `).all();

      return successResponse(res, conversions);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/units/conversions
 * Create a new unit conversion (admin/manager only)
 */
router.post(
  '/conversions',
  requireRole(['admin', 'manager']),
  validate({ body: createConversionSchema }),
  async (req, res, next) => {
    try {
      const { from_unit_id, to_unit_id, factor, ingredient_id } = req.body;

      // Validate units exist and have same dimension
      const fromUnit = db.prepare('SELECT dimension FROM units WHERE id = ?').get(from_unit_id);
      const toUnit = db.prepare('SELECT dimension FROM units WHERE id = ?').get(to_unit_id);

      if (!fromUnit || !toUnit) {
        throw new NotFoundError('One or both units not found');
      }

      if (fromUnit.dimension !== toUnit.dimension) {
        throw new ValidationError('Cannot create conversion between different dimensions');
      }

      // Check for duplicate
      const ingredientCheck = ingredient_id ? 'AND ingredient_id = ?' : 'AND ingredient_id IS NULL';
      const existing = db.prepare(`
        SELECT id FROM unit_conversions 
        WHERE from_unit_id = ? AND to_unit_id = ? ${ingredientCheck}
      `).get(from_unit_id, to_unit_id, ingredient_id || null);

      if (existing) {
        throw new ValidationError('Conversion already exists', { from_unit_id, to_unit_id, ingredient_id });
      }

      const result = db.prepare(`
        INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor, ingredient_id)
        VALUES (?, ?, ?, ?)
      `).run(from_unit_id, to_unit_id, factor, ingredient_id || null);

      // Invalidate conversion cache
      conversionService.invalidateCache();

      const newConversion = db.prepare(`
        SELECT 
          uc.id,
          uc.from_unit_id,
          fu.code as from_code,
          uc.to_unit_id,
          tu.code as to_code,
          uc.factor,
          uc.ingredient_id,
          i.name as ingredient_name,
          uc.created_at
        FROM unit_conversions uc
        JOIN units fu ON uc.from_unit_id = fu.id
        JOIN units tu ON uc.to_unit_id = tu.id
        LEFT JOIN ingredients i ON uc.ingredient_id = i.id
        WHERE uc.id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newConversion);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/units/convert
 * Convert a quantity from one unit to another
 */
router.post(
  '/convert',
  validate({ body: convertQuantitySchema }),
  async (req, res, next) => {
    try {
      const { qty, from_unit_id, to_unit_id, ingredient_id } = req.body;

      const result = conversionService.convert(qty, from_unit_id, to_unit_id, ingredient_id || null);

      return successResponse(res, {
        original: { qty, unit_id: from_unit_id },
        converted: { qty: result, unit_id: to_unit_id },
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
