import React from 'react';

/**
 * Badge component for status indicators
 * @param {object} props
 * @param {string} props.children - Badge content
 * @param {'default' | 'primary' | 'success' | 'warning' | 'danger'} props.variant - Badge color variant
 * @param {string} props.className - Additional CSS classes
 */
export default function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    primary: 'bg-indigo-100 text-indigo-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
