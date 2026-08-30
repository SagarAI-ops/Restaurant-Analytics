// server/src/utils/errors.js

/**
 * Base error class for all application errors.
 * All custom errors extend this to provide consistent error handling.
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Resource not found (404)
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Validation error (400)
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message || 'Validation failed', 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Conflict error (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Unauthorized error (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden error (403)
 */
class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
};
