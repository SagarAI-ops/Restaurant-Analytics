// server/src/utils/response.js

/**
 * Standard API response envelope helpers.
 */

/**
 * Success response with data
 */
function success(res, data, statusCode = 200, meta = null) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * Error response
 */
function error(res, err, statusCode = 500) {
  const body = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  };
  
  if (err.details) {
    body.error.details = err.details;
  }
  
  return res.status(statusCode).json(body);
}

module.exports = { success, error };
