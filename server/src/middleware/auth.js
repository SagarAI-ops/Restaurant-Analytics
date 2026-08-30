// server/src/middleware/auth.js

/**
 * Authentication middleware - verifies JWT token and attaches user to request.
 */

const jwt = require('jsonwebtoken');
const db = require('../db');
const { UnauthorizedError } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'stockhouse_super_secret_jwt_key_2026';

/**
 * Authenticate user from JWT token in Authorization header
 * Attaches user object to req.user if valid
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch fresh user data from database
    const user = db.prepare(`
      SELECT id, name, email, role, is_active
      FROM users
      WHERE id = ? AND is_active = 1
    `).get(decoded.userId);
    
    if (!user) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid token');
    }
    throw err;
  }
}

/**
 * Optional authentication - attaches user if token present, continues otherwise
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = db.prepare(`
      SELECT id, name, email, role, is_active
      FROM users
      WHERE id = ? AND is_active = 1
    `).get(decoded.userId);
    
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Silently ignore invalid tokens for optional auth
  }
  
  next();
}

module.exports = { authenticate, optionalAuth, JWT_SECRET };
