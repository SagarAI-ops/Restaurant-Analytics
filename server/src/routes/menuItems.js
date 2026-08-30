// server/src/routes/menuItems.js

const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate } = require('../middleware/validate');
const {
  createMenuItemSchema,
  updateMenuItemSchema,
  menuItemParamsSchema,
  menuItemQuerySchema,
  createRecipeSchema,
  recipeParamsSchema,
} = require('../schemas/menuItem.schemas');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { successResponse, createdResponse } = require('../utils/response');
const { conversionService } = require('../services/conversionService');
const { costingService } = require('../services/costingService');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/menu-items
 * List all menu items with optional filtering and sorting
 */
router.get(
  '/',
  validate({ query: menuItemQuerySchema }),
  async (req, res, next) => {
    try {
      const { q, category, is_active, include_cost, sort, order } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (q) {
        whereClause += ` AND (m.name LIKE ? OR m.code LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }

      if (category) {
        whereClause += ` AND c.name = ?`;
        params.push(category);
      }

      if (is_active !== undefined) {
        whereClause += ` AND m.is_active = ?`;
        params.push(is_active === 'true' ? 1 : 0);
      }

      const orderBy = `m.${sort || 'name'} ${order || 'asc'}`;

      const menuItems = db.prepare(`
        SELECT 
          m.id,
          m.code,
          m.name,
          m.category_id,
          c.name as category_name,
          m.selling_price,
          m.target_food_cost_percent,
          m.is_active,
          m.created_at,
          m.updated_at
        FROM menu_items m
        LEFT JOIN menu_categories c ON m.category_id = c.id
        WHERE ${whereClause}
        ORDER BY ${orderBy}
      `).all(...params);

      // Optionally include cost and margin calculations
      if (include_cost === 'true') {
        for (const item of menuItems) {
          const recipeCost = db.prepare(`
            SELECT COALESCE(SUM(ri.qty_base * i.current_cost_per_base), 0) as total_cost
            FROM recipes r
            JOIN recipe_ingredients ri ON r.id = ri.recipe_id
            JOIN ingredients i ON ri.ingredient_id = i.id
            WHERE r.menu_item_id = ? AND r.is_active = 1
            ORDER BY r.version DESC
            LIMIT 1
          `).get(item.id);

          const cost = recipeCost?.total_cost || 0;
          const margin = item.selling_price - cost;
          const marginPercent = item.selling_price > 0 ? (margin / item.selling_price) * 100 : 0;

          item.recipe_cost = cost;
          item.contribution_margin = margin;
          item.contribution_margin_percent = marginPercent;
        }
      }

      return successResponse(res, menuItems);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/menu-items
 * Create a new menu item (admin/manager only)
 */
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validate({ body: createMenuItemSchema }),
  async (req, res, next) => {
    try {
      const { code, name, category_id, selling_price, target_food_cost_percent, is_active } = req.body;

      // Check for duplicate code
      const existing = db.prepare('SELECT id FROM menu_items WHERE code = ?').get(code);
      if (existing) {
        throw new ValidationError('Menu item code already exists', { code });
      }

      const result = db.prepare(`
        INSERT INTO menu_items (code, name, category_id, selling_price, target_food_cost_percent, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(code, name, category_id || null, selling_price, target_food_cost_percent || 30, is_active ? 1 : 0);

      const newItem = db.prepare(`
        SELECT 
          m.id,
          m.code,
          m.name,
          m.category_id,
          c.name as category_name,
          m.selling_price,
          m.target_food_cost_percent,
          m.is_active,
          m.created_at,
          m.updated_at
        FROM menu_items m
        LEFT JOIN menu_categories c ON m.category_id = c.id
        WHERE m.id = ?
      `).get(result.lastInsertRowid);

      return createdResponse(res, newItem);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/menu-items/:id
 * Update a menu item (admin/manager only)
 */
router.patch(
  '/:id',
  requireRole(['admin', 'manager']),
  validate({ params: menuItemParamsSchema, body: updateMenuItemSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if menu item exists
      const existing = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(id);
      if (!existing) {
        throw new NotFoundError('Menu item not found');
      }

      // Check for duplicate code if code is being updated
      if (updates.code) {
        const duplicate = db.prepare('SELECT id FROM menu_items WHERE code = ? AND id != ?').get(updates.code, id);
        if (duplicate) {
          throw new ValidationError('Menu item code already exists', { code: updates.code });
        }
      }

      const setClauses = [];
      const values = [];

      const allowedFields = ['code', 'name', 'category_id', 'selling_price', 'target_food_cost_percent', 'is_active'];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`
          UPDATE menu_items
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `).run(...values);
      }

      const updated = db.prepare(`
        SELECT 
          m.id,
          m.code,
          m.name,
          m.category_id,
          c.name as category_name,
          m.selling_price,
          m.target_food_cost_percent,
          m.is_active,
          m.created_at,
          m.updated_at
        FROM menu_items m
        LEFT JOIN menu_categories c ON m.category_id = c.id
        WHERE m.id = ?
      `).get(id);

      return successResponse(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/menu-items/:id/recipes
 * Get all recipe versions for a menu item
 */
router.get(
  '/:id/recipes',
  validate({ params: menuItemParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check if menu item exists
      const menuItem = db.prepare('SELECT id, name FROM menu_items WHERE id = ?').get(id);
      if (!menuItem) {
        throw new NotFoundError('Menu item not found');
      }

      const recipes = db.prepare(`
        SELECT 
          r.id,
          r.menu_item_id,
          r.version,
          r.is_active,
          r.notes,
          r.created_by,
          u.name as created_by_name,
          r.created_at,
          (
            SELECT COALESCE(SUM(ri.qty_base * i.current_cost_per_base), 0)
            FROM recipe_ingredients ri
            JOIN ingredients i ON ri.ingredient_id = i.id
            WHERE ri.recipe_id = r.id
          ) as total_cost
        FROM recipes r
        LEFT JOIN users u ON r.created_by = u.id
        WHERE r.menu_item_id = ?
        ORDER BY r.version DESC
      `).all(id);

      // Get ingredients for each recipe
      for (const recipe of recipes) {
        const ingredients = db.prepare(`
          SELECT 
            ri.id,
            ri.recipe_id,
            ri.ingredient_id,
            i.name as ingredient_name,
            i.code as ingredient_code,
            ri.qty,
            ri.unit_id,
            u.code as unit_code,
            ri.qty_base,
            ri.cost_contribution
          FROM recipe_ingredients ri
          JOIN ingredients i ON ri.ingredient_id = i.id
          JOIN units u ON ri.unit_id = u.id
          WHERE ri.recipe_id = ?
          ORDER BY i.name
        `).all(recipe.id);

        recipe.ingredients = ingredients;
      }

      return successResponse(res, {
        menu_item: menuItem,
        recipes,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/menu-items/:id/recipes
 * Create a new recipe version for a menu item
 */
router.post(
  '/:id/recipes',
  requireRole(['admin', 'manager']),
  validate({ params: menuItemParamsSchema, body: createRecipeSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { notes, ingredients } = req.body;

      // Check if menu item exists
      const menuItem = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(id);
      if (!menuItem) {
        throw new NotFoundError('Menu item not found');
      }

      // Get the latest version number
      const latestVersion = db.prepare(`
        SELECT MAX(version) as max_version FROM recipes WHERE menu_item_id = ?
      `).get(id);

      const newVersion = (latestVersion?.max_version || 0) + 1;

      // Deactivate previous versions
      db.prepare(`
        UPDATE recipes SET is_active = 0 WHERE menu_item_id = ?
      `).run(id);

      // Create new recipe version within transaction
      const insertRecipe = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO recipes (menu_item_id, version, is_active, notes, created_by)
          VALUES (?, ?, 1, ?, ?)
        `).run(id, newVersion, notes || null, req.user.id);

        const recipeId = result.lastInsertRowid;

        // Insert recipe ingredients
        const insertIngredient = db.prepare(`
          INSERT INTO recipe_ingredients (recipe_id, ingredient_id, qty, unit_id, qty_base, cost_contribution)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const ing of ingredients) {
          // Convert quantity to base unit
          const qtyBase = conversionService.convert(ing.qty, ing.unit_id, null, ing.ingredient_id);
          
          // Get current cost per base unit
          const ingredient = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(ing.ingredient_id);
          const costContribution = qtyBase * (ingredient?.current_cost_per_base || 0);

          insertIngredient.run(recipeId, ing.ingredient_id, ing.qty, ing.unit_id, qtyBase, costContribution);
        }

        return recipeId;
      });

      const recipeId = insertRecipe();

      const newRecipe = db.prepare(`
        SELECT 
          r.id,
          r.menu_item_id,
          r.version,
          r.is_active,
          r.notes,
          r.created_by,
          u.name as created_by_name,
          r.created_at
        FROM recipes r
        LEFT JOIN users u ON r.created_by = u.id
        WHERE r.id = ?
      `).get(recipeId);

      return createdResponse(res, newRecipe);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/menu-items/:id/recalc-cost
 * Recalculate recipe cost for a menu item (admin/manager only)
 */
router.post(
  '/:id/recalc-cost',
  requireRole(['admin', 'manager']),
  validate({ params: menuItemParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check if menu item exists
      const menuItem = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(id);
      if (!menuItem) {
        throw new NotFoundError('Menu item not found');
      }

      // Get active recipe
      const recipe = db.prepare(`
        SELECT id FROM recipes WHERE menu_item_id = ? AND is_active = 1
        ORDER BY version DESC
        LIMIT 1
      `).get(id);

      if (!recipe) {
        throw new NotFoundError('No active recipe found for this menu item');
      }

      // Recalculate cost contributions for all ingredients
      const recalcCosts = db.transaction(() => {
        const ingredients = db.prepare(`
          SELECT ri.id, ri.recipe_id, ri.ingredient_id, ri.qty_base
          FROM recipe_ingredients ri
          WHERE ri.recipe_id = ?
        `).all(recipe.id);

        const updateCost = db.prepare(`
          UPDATE recipe_ingredients
          SET cost_contribution = ?
          WHERE id = ?
        `);

        for (const ing of ingredients) {
          const ingredient = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(ing.ingredient_id);
          const newCost = ing.qty_base * (ingredient?.current_cost_per_base || 0);
          updateCost.run(newCost, ing.id);
        }
      });

      recalcCosts();

      // Get updated recipe cost
      const updatedRecipe = db.prepare(`
        SELECT 
          r.id,
          r.version,
          (
            SELECT COALESCE(SUM(ri.cost_contribution), 0)
            FROM recipe_ingredients ri
            WHERE ri.recipe_id = r.id
          ) as total_cost
        FROM recipes r
        WHERE r.id = ?
      `).get(recipe.id);

      return successResponse(res, updatedRecipe);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
