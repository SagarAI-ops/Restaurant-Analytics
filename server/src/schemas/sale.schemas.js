// server/src/schemas/sale.schemas.js

const { z } = require('zod');

const saleItemSchema = z.object({
  menu_item_id: z.number().int().positive(),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  channel_id: z.number().int().positive().optional(),
  payment_method: z.enum(['cash', 'card', 'upi', 'online']).optional(),
  shift: z.enum(['day', 'night', 'breakfast', 'lunch', 'dinner']).optional(),
  items: z.array(saleItemSchema).min(1, 'At least one item required'),
  notes: z.string().optional(),
});

const saleParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const saleQuerySchema = z.object({
  channel_id: z.string().optional(),
  payment_method: z.string().optional(),
  shift: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  sort: z.enum(['recorded_at', 'total_amount']).default('recorded_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

module.exports = {
  createSaleSchema,
  saleItemSchema,
  saleParamsSchema,
  saleQuerySchema,
};
