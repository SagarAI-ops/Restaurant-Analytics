// server/src/services/purchaseService.js

const db = require('../db');
const { costingService } = require('./costingService');
const { inventoryService } = require('./inventoryService');
const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Confirm a purchase order
 * - Updates weighted moving average cost
 * - Posts purchase movements
 * - Upserts supplier prices
 * @param {number} purchaseId 
 * @param {number} userId 
 * @returns {object} Confirmed purchase with movements
 */
function confirmPurchase(purchaseId, userId) {
  const confirmTransaction = db.transaction(() => {
    // Get purchase details
    const purchase = db.prepare(`
      SELECT 
        p.id, p.supplier_id, p.invoice_number, p.status,
        p.subtotal, p.tax_amount, p.discount_amount, p.total_amount,
        p.notes, p.created_at
      FROM purchases p
      WHERE p.id = ?
    `).get(purchaseId);

    if (!purchase) {
      throw new NotFoundError('Purchase not found');
    }

    if (purchase.status !== 'draft') {
      throw new ValidationError(`Cannot confirm purchase with status: ${purchase.status}`);
    }

    // Get purchase items
    const items = db.prepare(`
      SELECT 
        pi.id, pi.ingredient_id, i.name as ingredient_name, i.base_unit_id,
        pi.qty, pi.unit_id, u.code as unit_code,
        pi.qty_base, pi.unit_cost, pi.total_cost, pi.expiry_date
      FROM purchase_items pi
      JOIN ingredients i ON pi.ingredient_id = i.id
      JOIN units u ON pi.unit_id = u.id
      WHERE pi.purchase_id = ?
    `).all(purchaseId);

    if (items.length === 0) {
      throw new ValidationError('Purchase has no items');
    }

    // Process each item: update WMA and post movement
    for (const item of items) {
      // Update weighted moving average
      costingService.updateWMA(item.ingredient_id, item.qty_base, item.unit_cost);

      // Post purchase movement
      inventoryService.postMovement({
        ingredient_id: item.ingredient_id,
        movement_type: 'purchase',
        qty_base: item.qty_base,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        reference_type: 'purchase',
        reference_id: purchaseId,
        expiry_date: item.expiry_date,
        user_id: userId,
        notes: `Invoice: ${purchase.invoice_number || 'N/A'}`,
      });
    }

    // Upsert supplier prices
    const upsertPrice = db.prepare(`
      INSERT INTO supplier_prices (supplier_id, ingredient_id, purchase_unit_id, price_per_purchase_unit, effective_date)
      VALUES (?, ?, ?, ?, date('now'))
      ON CONFLICT(supplier_id, ingredient_id, purchase_unit_id) DO UPDATE SET
        price_per_purchase_unit = excluded.price_per_purchase_unit,
        effective_date = excluded.effective_date
    `);

    const supplierPrices = db.prepare(`
      SELECT DISTINCT supplier_id, ingredient_id, unit_id as purchase_unit_id, unit_cost as price
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.id = ?
    `).all(purchaseId);

    for (const sp of supplierPrices) {
      upsertPrice.run(sp.supplier_id, sp.ingredient_id, sp.purchase_unit_id, sp.price);
    }

    // Update purchase status
    db.prepare(`
      UPDATE purchases SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(purchaseId);

    // Return confirmed purchase with items
    const updated = db.prepare(`
      SELECT 
        p.id, p.supplier_id, s.name as supplier_name, p.invoice_number, p.status,
        p.subtotal, p.tax_amount, p.discount_amount, p.total_amount,
        p.confirmed_at, p.notes
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `).get(purchaseId);

    updated.items = items;

    return updated;
  });

  return confirmTransaction();
}

/**
 * Void a confirmed purchase
 * - Posts reversal movements (negative quantities)
 * - Does NOT revert WMA (to maintain cost history integrity)
 * @param {number} purchaseId 
 * @param {number} userId 
 * @returns {object} Voided purchase
 */
function voidPurchase(purchaseId, userId) {
  const voidTransaction = db.transaction(() => {
    const purchase = db.prepare(`
      SELECT id, supplier_id, invoice_number, status
      FROM purchases
      WHERE id = ?
    `).get(purchaseId);

    if (!purchase) {
      throw new NotFoundError('Purchase not found');
    }

    if (purchase.status !== 'confirmed') {
      throw new ValidationError(`Cannot void purchase with status: ${purchase.status}`);
    }

    // Get original items
    const items = db.prepare(`
      SELECT 
        ingredient_id, qty_base, unit_cost, total_cost
      FROM purchase_items
      WHERE purchase_id = ?
    `).all(purchaseId);

    // Post reversal movements
    for (const item of items) {
      inventoryService.postMovement({
        ingredient_id: item.ingredient_id,
        movement_type: 'purchase',
        qty_base: -item.qty_base,
        unit_cost: item.unit_cost,
        total_cost: -item.total_cost,
        reference_type: 'purchase_void',
        reference_id: purchaseId,
        user_id: userId,
        notes: `Void invoice: ${purchase.invoice_number || 'N/A'}`,
      });
    }

    // Update purchase status
    db.prepare(`
      UPDATE purchases SET status = 'voided', voided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(purchaseId);

    return { id: purchaseId, status: 'voided', voided_at: new Date().toISOString() };
  });

  return voidTransaction();
}

module.exports = {
  confirmPurchase,
  voidPurchase,
};
