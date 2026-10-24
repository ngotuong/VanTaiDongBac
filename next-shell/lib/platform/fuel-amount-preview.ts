import { normalizeVietnameseNumberInput } from './numeric-input';

/** Mirrors NL_Dau G: blank until both positive inputs exist; never a write payload. */
export function fuelAmountPreview(liters: string, price: string): number | null {
  const values = [liters, price].map(value => normalizeVietnameseNumberInput(value));
  if (values.some(value => value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const numbers = values.map(Number);
  if (numbers.some(value => !Number.isFinite(value) || value <= 0)) return null;
  // Multiply decimal integers first so 165,3 × 23.500 does not gain a float tail.
  const parts = values.map(value => value.split('.'));
  const scale = parts.reduce((total, part) => total + (part[1]?.length || 0), 0);
  const digits = (BigInt(parts[0].join('')) * BigInt(parts[1].join(''))).toString().padStart(scale + 1, '0');
  const total = Number(scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
  return Number.isFinite(total) ? total : null;
}

/** Round for display only. The raw multiplication and Sheet formula remain unchanged. */
export function formatFuelAmountPreview(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} đ`;
}
