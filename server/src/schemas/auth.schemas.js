// server/src/schemas/auth.schemas.js

/**
 * Zod schemas for authentication and user management.
 */

const { z } = require('zod');

/**
 * Login request schema
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * User creation schema (admin only)
 */
const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'manager', 'staff']).default('staff'),
  pin_code: z.string().length(4).optional().or(z.literal('')),
});

/**
 * User update schema (partial)
 */
const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  pin_code: z.string().length(4).optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

/**
 * User params schema for route parameters
 */
const userParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * User query schema for list filtering
 */
const userQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('50'),
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  is_active: z.string().transform(v => v === 'true').optional(),
});

module.exports = {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  userParamsSchema,
  userQuerySchema,
};
