// server/src/schemas/count.schemas.js

const { z } = require('zod');

const countItemSchema = z.object({
  ingredient_id: z.number().int().positive(),
  actual_qty: z.number().nonnegative(),
  unit_id: z.number().int().positive(),
  reason_text: z.string().optional(),
});

const createCountSchema = z.object({
  name: z.string().min(1, 'Name required'),
  location_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const updateCountItemsSchema = z.object({
  items: z.array(countItemSchema).min(1, 'At least one item required'),
});

const completeCountSchema = z.object({
  notes: z.string().optional(),
});

const countParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const countQuerySchema = z.object({
  status: z.enum(['open', 'completed']).optional(),
  location_id: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  sort: z.enum(['created_at', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

module.exports = {
  createCountSchema,
  updateCountItemsSchema,
  completeCountSchema,
  countItemSchema,
  countParamsSchema,
  countQuerySchema,
};
