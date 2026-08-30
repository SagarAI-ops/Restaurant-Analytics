// server/src/middleware/errorHandler.js

/**
 * Global error handling middleware.
 * Returns structured error responses for known errors, 500 for unknown.
 */

const { AppError } = require('../utils/errors');

/**
 * Express error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log error for debugging (in production, use proper logging service)
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Error]', err);
  }
  
  // Known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || null,
      },
    });
  }
  
  // Zod validation errors (if not caught by validate middleware)
  if (err.name === 'ZodError') {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
    });
  }
  
  // Better-sqlite3 errors
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
      },
    });
  }
  
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Referenced resource not found',
      },
    });
  }
  
  // Unknown errors - return 500
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'An unexpected error occurred',
    },
  });
}

module.exports = { errorHandler };
