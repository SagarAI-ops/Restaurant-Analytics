// server/src/services/saleService.js

const db = require('../db');
const { inventoryService } = require('./inventoryService');
const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Record a sale and deduct ingredients based on recipes
 * @param {object} saleData - { channel_id, payment_method, shift, items: [{menu_item_id, qty, unit_price}], notes }
 * @param {number} userId 
 * @returns {object} Created sale with unpriced_items count
 */
function recordSale(saleData, userId) {
  const recordTransaction = db.transaction(() => {
    const { channel_id, payment_method, shift, items, notes } = saleData;

    // Validate channel if provided
    if (channel_id) {
      const channel = db.prepare('SELECT id, commission_percent FROM sales_channels WHERE id = ?').get(channel_id);
      if (!channel) {
        throw new NotFoundError('Sales channel not found');
      }
    }

    // Calculate totals
    let subtotal = 0;
    let totalQty = 0;
    
    for (const item of items) {
      subtotal += item.qty * item.unit_price;
      totalQty += item.qty;
    }

    const tax_amount = subtotal * 0.18; // 18% GST
    const total_amount = subtotal + tax_amount;

    // Insert sale
    const saleResult = db.prepare(`
      INSERT INTO sales (channel_id, payment_method, shift, subtotal, tax_amount, total_amount, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(channel_id || null, payment_method || 'cash', shift || 'day', subtotal, tax_amount, total_amount, notes || null, userId);

    const saleId = saleResult.lastInsertRowid;

    // Insert sale items and process recipe deductions
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, menu_item_id, qty, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    let unpricedCount = 0;

    for (const item of items) {
      // Insert sale item
      insertItem.run(saleId, item.menu_item_id, item.qty, item.unit_price, item.qty * item.unit_price);

      // Get active recipe for menu item
      const recipe = db.prepare(`
        SELECT id FROM recipes 
        WHERE menu_item_id = ? AND is_active = 1 
        ORDER BY version DESC 
        LIMIT 1
      `).get(item.menu_item_id);

      if (!recipe) {
        unpricedCount++;
        continue; // Skip deduction if no recipe
      }

      // Get recipe ingredients
      const recipeIngredients = db.prepare(`
        SELECT ingredient_id, qty_base
        FROM recipe_ingredients
        WHERE recipe_id = ?
      `).all(recipe.id);

      // Post sale movements for each ingredient
      for (const ri of recipeIngredients) {
        const consumedQty = ri.qty_base * item.qty;
        
        // Get current cost
        const ingredient = db.prepare('SELECT current_cost_per_base FROM ingredients WHERE id = ?').get(ri.ingredient_id);
        const unitCost = ingredient?.current_cost_per_base || 0;

        inventoryService.postMovement({
          ingredient_id: ri.ingredient_id,
          movement_type: 'sale',
          qty_base: -consumedQty,
          unit_cost: unitCost,
          total_cost: -consumedQty * unitCost,
          reference_type: 'sale',
          reference_id: saleId,
          user_id: userId,
          notes: `Menu item ID: ${item.menu_item_id}`,
        });
      }
    }

    // Return created sale
    const sale = db.prepare(`
      SELECT 
        s.id, s.sale_number, s.channel_id, c.name as channel_name,
        s.payment_method, s.shift, s.subtotal, s.tax_amount, s.total_amount,
        s.notes, s.recorded_at, s.recorded_by, u.name as recorded_by_name
      FROM sales s
      LEFT JOIN sales_channels c ON s.channel_id = c.id
      LEFT JOIN users u ON s.recorded_by = u.id
      WHERE s.id = ?
    `).get(saleId);

    sale.items = items;
    sale.unpriced_items = unpricedCount;

    return sale;
  });

  return recordTransaction();
}

/**
 * Import sales from CSV data
 * @param {array} rows - Array of sale objects
 * @param {number} userId 
 * @returns {object} Summary of import
 */
function importSales(rows, userId) {
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      
      // Parse items from row (assuming format: menu_item_id,qty,unit_price repeated)
      const items = [];
      for (let j = 0; j < 10; j++) { // Support up to 10 items per sale
        const menuItemId = row[`menu_item_id_${j}`];
        const qty = parseFloat(row[`qty_${j}`]);
        const unitPrice = parseFloat(row[`unit_price_${j}`]);
        
        if (menuItemId && qty && unitPrice) {
          items.push({ menu_item_id: parseInt(menuItemId), qty, unit_price: unitPrice });
        }
      }

      if (items.length === 0) {
        throw new ValidationError(`No valid items in row ${i + 1}`);
      }

      recordSale({
        channel_id: row.channel_id ? parseInt(row.channel_id) : null,
        payment_method: row.payment_method || 'cash',
        shift: row.shift || 'day',
        items,
        notes: row.notes,
      }, userId);

      successCount++;
    } catch (error) {
      errorCount++;
      errors.push({ row: i + 1, error: error.message });
    }
  }

  return { successCount, errorCount, errors };
}

module.exports = {
  recordSale,
  importSales,
};
