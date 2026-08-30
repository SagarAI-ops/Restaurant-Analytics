// server/src/schemas/menuItem.schemas.js

const { z } = require('zod');

/**
 * Schema for creating a new menu item
 */
const createMenuItemSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  category_id: z.number().int().positive().nullable().optional(),
  selling_price: z.number().positive(),
  target_food_cost_percent: z.number().positive().max(100).optional().default(30),
  is_active: z.boolean().optional().default(true),
});

/**
 * Schema for updating a menu item
 */
const updateMenuItemSchema = createMenuItemSchema.partial();

/**
 * Schema for menu item URL parameters
 */
const menuItemParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Schema for menu item query parameters (filtering/sorting)
 */
const menuItemQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  is_active: z.string().transform(v => v === 'true').optional(),
  include_cost: z.string().transform(v => v === 'true').optional(),
  sort: z.enum(['name', 'code', 'selling_price', 'created_at']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Schema for creating a recipe version
 */
const createRecipeSchema = z.object({
  menu_item_id: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  ingredients: z.array(z.object({
    ingredient_id: z.number().int().positive(),
    qty: z.number().positive(),
    unit_id: z.number().int().positive(),
  })).min(1),
});

/**
 * Schema for recipe URL parameters
 */
const recipeParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

module.exports = {
  createMenuItemSchema,
  updateMenuItemSchema,
  menuItemParamsSchema,
  menuItemQuerySchema,
  createRecipeSchema,
  recipeParamsSchema,
};
