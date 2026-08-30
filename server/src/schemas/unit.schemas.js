// server/src/schemas/unit.schemas.js

const { z } = require('zod');

/**
 * Schema for creating a new unit
 */
const createUnitSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(50),
  dimension: z.enum(['weight', 'volume', 'count']),
  is_base: z.boolean().optional().default(false),
});

/**
 * Schema for updating a unit
 */
const updateUnitSchema = createUnitSchema.partial();

/**
 * Schema for unit URL parameters
 */
const unitParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Schema for unit query parameters (filtering/sorting)
 */
const unitQuerySchema = z.object({
  dimension: z.enum(['weight', 'volume', 'count']).optional(),
  is_base: z.string().transform(v => v === 'true').optional(),
  sort: z.enum(['code', 'name', 'dimension', 'created_at']).optional().default('code'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Schema for creating a unit conversion
 */
const createConversionSchema = z.object({
  from_unit_id: z.number().int().positive(),
  to_unit_id: z.number().int().positive(),
  factor: z.number().positive(),
  ingredient_id: z.number().int().positive().nullable().optional(),
});

/**
 * Schema for converting a quantity between units
 */
const convertQuantitySchema = z.object({
  qty: z.number().positive(),
  from_unit_id: z.number().int().positive(),
  to_unit_id: z.number().int().positive(),
  ingredient_id: z.number().int().positive().nullable().optional(),
});

module.exports = {
  createUnitSchema,
  updateUnitSchema,
  unitParamsSchema,
  unitQuerySchema,
  createConversionSchema,
  convertQuantitySchema,
};
