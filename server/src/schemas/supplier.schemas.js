// server/src/schemas/supplier.schemas.js

const { z } = require('zod');

/**
 * Schema for creating a new supplier
 */
const createSupplierSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  contact_person: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  lead_time_days: z.number().int().positive().optional().default(1),
  min_order_value: z.number().nonnegative().optional().default(0),
  payment_terms: z.string().max(200).optional(),
  rating: z.number().min(0).max(5).optional().default(5),
  is_active: z.boolean().optional().default(true),
});

/**
 * Schema for updating a supplier
 */
const updateSupplierSchema = createSupplierSchema.partial();

/**
 * Schema for supplier URL parameters
 */
const supplierParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Schema for supplier query parameters (filtering/sorting)
 */
const supplierQuerySchema = z.object({
  q: z.string().optional(),
  is_active: z.string().transform(v => v === 'true').optional(),
  sort: z.enum(['name', 'code', 'rating', 'created_at']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Schema for supplier price changes query
 */
const supplierPriceChangesQuerySchema = z.object({
  days: z.number().int().positive().optional().default(30),
});

module.exports = {
  createSupplierSchema,
  updateSupplierSchema,
  supplierParamsSchema,
  supplierQuerySchema,
  supplierPriceChangesQuerySchema,
};
