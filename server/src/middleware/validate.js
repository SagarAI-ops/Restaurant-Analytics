// server/src/middleware/validate.js

/**
 * Request validation middleware using Zod schemas.
 */

const { ValidationError } = require('../utils/errors');

/**
 * Validate request against a Zod schema
 * @param {ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'params' | 'query'} target - Which part of request to validate
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req[target]);
      
      if (!result.success) {
        const details = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        throw new ValidationError('Validation failed', details);
      }
      
      // Attach validated data to request
      req[`${target}Validated`] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate };
