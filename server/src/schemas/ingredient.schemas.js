// server/src/schemas/ingredient.schemas.js

const { z } = require('zod');

/**
 * Schema for creating a new ingredient
 */
const createIngredientSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  category_id: z.number().int().positive().nullable().optional(),
  base_unit_id: z.number().int().positive(),
  default_location_id: z.number().int().positive().nullable().optional(),
  current_cost_per_base: z.number().nonnegative().optional().default(0),
  yield_percent: z.number().positive().max(100).optional().default(100),
  par_level_base: z.number().nonnegative().optional().default(0),
  reorder_point_base: z.number().nonnegative().optional().default(0),
  reorder_qty_base: z.number().nonnegative().optional().default(0),
  shelf_life_days: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

/**
 * Schema for updating an ingredient
 */
const updateIngredientSchema = createIngredientSchema.partial();

/**
 * Schema for ingredient URL parameters
 */
const ingredientParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Schema for ingredient query parameters (filtering/sorting)
 */
const ingredientQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  low_stock: z.string().transform(v => v === 'true').optional(),
  expiring_days: z.number().int().positive().optional(),
  sort: z.enum(['name', 'code', 'current_cost_per_base', 'created_at']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

module.exports = {
  createIngredientSchema,
  updateIngredientSchema,
  ingredientParamsSchema,
  ingredientQuerySchema,
};
