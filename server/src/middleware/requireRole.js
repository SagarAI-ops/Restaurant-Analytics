// server/src/middleware/requireRole.js

/**
 * Role-based authorization middleware.
 * Checks if authenticated user has required role(s).
 */

const { ForbiddenError } = require('../utils/errors');

/**
 * Require specific role(s) for access
 * @param {string|string[]} allowedRoles - Single role or array of roles
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }
    
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
    }
    
    next();
  };
}

/**
 * Require admin role specifically
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }
  if (req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
}

/**
 * Require admin or manager role
 */
function requireManagerOrAdmin(req, res, next) {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }
  if (!['admin', 'manager'].includes(req.user.role)) {
    throw new ForbiddenError('Manager or admin access required');
  }
  next();
}

module.exports = { requireRole, requireAdmin, requireManagerOrAdmin };
