// server/src/schemas/transfer.schemas.js

const { z } = require('zod');

const transferItemSchema = z.object({
  ingredient_id: z.number().int().positive(),
  qty: z.number().positive(),
  unit_id: z.number().int().positive(),
});

const createTransferSchema = z.object({
  from_location_id: z.number().int().positive(),
  to_location_id: z.number().int().positive(),
  items: z.array(transferItemSchema).min(1, 'At least one item required'),
  notes: z.string().optional(),
});

const transferParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const transferQuerySchema = z.object({
  from_location_id: z.string().optional(),
  to_location_id: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  sort: z.enum(['created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

module.exports = {
  createTransferSchema,
  transferItemSchema,
  transferParamsSchema,
  transferQuerySchema,
};
