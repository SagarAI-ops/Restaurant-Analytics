// server/src/routes/auth.js

/**
 * Authentication routes: login, me, user CRUD (admin)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const { success, error } = require('../utils/response');
const { 
  loginSchema, 
  createUserSchema, 
  updateUserSchema, 
  userParamsSchema,
  userQuerySchema 
} = require('../schemas/auth.schemas');
const { NotFoundError, ConflictError, UnauthorizedError } = require('../utils/errors');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'stockhouse_super_secret_jwt_key_2026';

/**
 * POST /api/auth/login - User login
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.bodyValidated;
    
    // Find user by email
    const user = db.prepare(`
      SELECT id, name, email, role, password_hash, is_active
      FROM users
      WHERE email = ?
    `).get(email.toLowerCase());
    
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data without password hash
    const { password_hash, ...userData } = user;
    
    success(res, { token, user: userData });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me - Get current user profile
 */
router.get('/me', authenticate, (req, res, next) => {
  try {
    success(res, { user: req.user });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users - List all users (admin only)
 */
router.get('/users', authenticate, requireAdmin, validate(userQuerySchema, 'query'), (req, res, next) => {
  try {
    const { page, limit, role, is_active } = req.queryValidated;
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT id, name, email, role, pin_code, is_active, created_at, updated_at FROM users WHERE 1=1';
    const params = [];
    
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    
    if (is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(is_active);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(sql);
    const users = stmt.all(...params);
    
    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    
    if (role) {
      countSql += ' AND role = ?';
      countParams.push(role);
    }
    
    if (is_active !== undefined) {
      countSql += ' AND is_active = ?';
      countParams.push(is_active);
    }
    
    const total = db.prepare(countSql).get(...countParams).total;
    
    success(res, { users }, 200, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users - Create new user (admin only)
 */
router.post('/users', authenticate, requireAdmin, validate(createUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, pin_code } = req.bodyValidated;
    
    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      throw new ConflictError('Email already registered');
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, pin_code)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      name,
      email.toLowerCase(),
      passwordHash,
      role,
      pin_code || null
    );
    
    const newUser = db.prepare(`
      SELECT id, name, email, role, pin_code, is_active, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(result.lastInsertRowid);
    
    success(res, { user: newUser }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id - Get user by ID (admin only)
 */
router.get('/users/:id', authenticate, requireAdmin, validate(userParamsSchema, 'params'), (req, res, next) => {
  try {
    const { id } = req.paramsValidated;
    
    const user = db.prepare(`
      SELECT id, name, email, role, pin_code, is_active, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(id);
    
    if (!user) {
      throw new NotFoundError('User');
    }
    
    success(res, { user });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/:id - Update user (admin only)
 */
router.patch('/users/:id', authenticate, requireAdmin, validate(userParamsSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.paramsValidated;
    const updates = req.bodyValidated;
    
    // Check user exists
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!existing) {
      throw new NotFoundError('User');
    }
    
    // Hash password if provided
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }
    
    // Build update query dynamically
    const allowedFields = ['name', 'email', 'password_hash', 'role', 'pin_code', 'is_active'];
    const fields = [];
    const values = [];
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'email' ? updates[key].toLowerCase() : updates[key]);
      }
    }
    
    if (fields.length === 0) {
      success(res, { message: 'No updates provided' });
      return;
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    
    const updatedUser = db.prepare(`
      SELECT id, name, email, role, pin_code, is_active, created_at, updated_at
      FROM users
      WHERE id = ?
    `).get(id);
    
    success(res, { user: updatedUser });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id - Delete user (admin only)
 */
router.delete('/users/:id', authenticate, requireAdmin, validate(userParamsSchema, 'params'), (req, res, next) => {
  try {
    const { id } = req.paramsValidated;
    
    // Check user exists and is not the last admin
    if (id === req.user.id) {
      throw new Error('Cannot delete your own account');
    }
    
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    
    // Prevent deleting last admin
    if (user.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    success(res, { message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
