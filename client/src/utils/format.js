/**
 * Utility functions for formatting
 */

/**
 * Format money in Indian locale (₹1,23,456.78)
 */
export function formatMoney(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Round to 3 decimal places
 */
function round3(num) {
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

/**
 * Format quantity with smart unit display
 * - g → kg when >= 1000
 * - ml → L when >= 1000
 */
export function formatQty(qtyBase, baseUnitCode = '') {
  if (qtyBase === null || qtyBase === undefined) return '—';
  
  const qty = round3(qtyBase);
  
  // Smart scaling for weight/volume
  if (baseUnitCode === 'g' && qty >= 1000) {
    return `${round3(qty / 1000)} kg`;
  }
  if (baseUnitCode === 'ml' && qty >= 1000) {
    return `${round3(qty / 1000)} L`;
  }
  
  return `${qty} ${baseUnitCode}`;
}

/**
 * Format date for display
 */
export function formatDate(date, options = {}) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  
  const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-IN', { ...defaultOptions, ...options });
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with locale separators
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
