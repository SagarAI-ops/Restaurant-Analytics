// server/src/schemas/channel.schemas.js

const { z } = require('zod');

/**
 * Schema for creating a new sales channel
 */
const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
  commission_percent: z.number().nonnegative().max(100).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

/**
 * Schema for updating a sales channel
 */
const updateChannelSchema = createChannelSchema.partial();

/**
 * Schema for channel URL parameters
 */
const channelParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Schema for channel query parameters (filtering/sorting)
 */
const channelQuerySchema = z.object({
  q: z.string().optional(),
  is_active: z.string().transform(v => v === 'true').optional(),
  sort: z.enum(['name', 'commission_percent', 'created_at']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

module.exports = {
  createChannelSchema,
  updateChannelSchema,
  channelParamsSchema,
  channelQuerySchema,
};
