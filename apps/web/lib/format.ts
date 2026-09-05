// India-localized formatting helpers (INR currency, en-IN dates/numbers).

const inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a value as Indian Rupees (₹). Pass withPaise=true for 2 decimals. */
export function inr(value: string | number | null | undefined, withPaise = false): string {
  const n = Number(value ?? 0);
  return (withPaise ? inr2 : inr0).format(Number.isFinite(n) ? n : 0);
}

/** Format a date in en-IN (dd/mm/yyyy). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

/** Format a date + time in en-IN. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN');
}
