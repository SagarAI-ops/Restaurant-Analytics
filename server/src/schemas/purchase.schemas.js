// server/src/schemas/purchase.schemas.js

const { z } = require('zod');

const createPurchaseItemSchema = z.object({
  ingredient_id: z.number().int().positive(),
  qty: z.number().positive(),
  unit_id: z.number().int().positive(),
  unit_cost: z.number().nonnegative(),
  expiry_date: z.string().optional(),
});

const createPurchaseSchema = z.object({
  supplier_id: z.number().int().positive(),
  invoice_number: z.string().optional(),
  items: z.array(createPurchaseItemSchema).min(1, 'At least one item required'),
  notes: z.string().optional(),
});

const updatePurchaseSchema = z.object({
  supplier_id: z.number().int().positive().optional(),
  invoice_number: z.string().optional(),
  items: z.array(createPurchaseItemSchema).optional(),
  notes: z.string().optional(),
});

const purchaseParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const purchaseQuerySchema = z.object({
  status: z.enum(['draft', 'confirmed', 'voided']).optional(),
  supplier_id: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  sort: z.enum(['created_at', 'total_amount', 'invoice_number']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

module.exports = {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseParamsSchema,
  purchaseQuerySchema,
};
