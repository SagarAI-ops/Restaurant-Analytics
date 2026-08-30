// server/src/utils/helpers.js

/**
 * Round to 2 decimal places (for money)
 */
function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Round to 3 decimal places (for quantities)
 */
function round3(num) {
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

/**
 * Format currency in Indian locale (₹1,23,456.78)
 */
const formatMoney = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format;

/**
 * Format quantity with smart unit display
 */
function formatQty(qtyBase, baseUnitCode) {
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
 * Parse ISO date string to local date
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format date for display
 */
function formatDate(date, options = {}) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  
  const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-IN', { ...defaultOptions, ...options });
}

module.exports = {
  round2,
  round3,
  formatMoney,
  formatQty,
  parseDate,
  formatDate,
};
