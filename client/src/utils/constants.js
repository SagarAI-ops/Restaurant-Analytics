/**
 * Application constants
 */

// User roles
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
};

// Movement types
export const MOVEMENT_TYPES = {
  PURCHASE: 'purchase',
  SALE: 'sale',
  WASTAGE: 'wastage',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  COUNT_CORRECTION: 'count_correction',
  OPENING: 'opening',
};

// Purchase statuses
export const PURCHASE_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  VOIDED: 'voided',
};

// Stock count statuses
export const COUNT_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Wastage reasons
export const WASTAGE_REASONS = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'preparation', label: 'Preparation Waste' },
  { value: 'spill', label: 'Spill/Accident' },
  { value: 'expired', label: 'Expired' },
  { value: 'trimming', label: 'Trimming' },
  { value: 'other', label: 'Other' },
];

// Alert types
export const ALERT_TYPES = {
  LOW_STOCK: 'low_stock',
  EXPIRING_SOON: 'expiring_soon',
  HIGH_VARIANCE: 'high_variance',
  PRICE_SPIKE: 'price_spike',
  FOOD_COST_TARGET_EXCEEDED: 'food_cost_target_exceeded',
  UNPRICED_SALE: 'unpriced_sale',
  NEGATIVE_STOCK: 'negative_stock',
  MISSING_RECIPE: 'missing_recipe',
};

// Alert severities
export const ALERT_SEVERITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Menu item profitability classes (Menu Engineering)
export const MENU_CLASSES = {
  STAR: 'star',           // High popularity, high CM%
  PLOWHORSE: 'plowhorse', // High popularity, low CM%
  PUZZLE: 'puzzle',       // Low popularity, high CM%
  DOG: 'dog',             // Low popularity, low CM%
};

// Shifts
export const SHIFTS = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
];

// Payment methods
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'aggregator', label: 'Aggregator' },
];

// Default pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'en-IN',
  INPUT: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
};
