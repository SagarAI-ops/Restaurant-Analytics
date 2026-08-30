// server/src/schemas/wastage.schemas.js

const { z } = require('zod');

const createWastageSchema = z.object({
  ingredient_id: z.number().int().positive(),
  qty: z.number().positive(),
  unit_id: z.number().int().positive(),
  reason_id: z.number().int().positive(),
  shift: z.enum(['day', 'night', 'breakfast', 'lunch', 'dinner']).optional(),
  notes: z.string().optional(),
});

const wastageParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const wastageQuerySchema = z.object({
  ingredient_id: z.string().optional(),
  reason_id: z.string().optional(),
  shift: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  sort: z.enum(['created_at', 'total_cost']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

module.exports = {
  createWastageSchema,
  wastageParamsSchema,
  wastageQuerySchema,
};
