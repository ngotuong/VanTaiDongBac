// Stored values use dot decimals; user input uses Vietnamese separators.
// Keep blanks and precision when opening an editor, rather than using a KPI formatter.
export function formatStoredNumberInput(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const [integer, decimals] = text.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

export function formatVietnameseNumberInput(value: string, allowDecimal = true): string {
  const source = String(value ?? '').trim();
  const negative = source.startsWith('-');
  const cleaned = source.replace(/-/g, '').replace(/[^\d,]/g, '');
  const commaIndex = allowDecimal ? cleaned.indexOf(',') : -1;
  const integerSource = (commaIndex >= 0 ? cleaned.slice(0, commaIndex) : cleaned).replace(/\D/g, '');
  const decimalSource = commaIndex >= 0 ? cleaned.slice(commaIndex + 1).replace(/\D/g, '') : '';

  if (!integerSource && commaIndex < 0) return negative ? '-' : '';

  const integer = (integerSource || '0').replace(/^0+(?=\d)/, '');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${commaIndex >= 0 ? `,${decimalSource}` : ''}`;
}

export function normalizeVietnameseNumberInput(value: string): string {
  const source = String(value ?? '').trim().replace(/\s/g, '');
  if (!source) return '';
  const normalized = source.includes(',')
    ? source.replace(/\./g, '').replace(/,(?=.*[,])/g, '').replace(',', '.')
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(source)
      ? source.replace(/\./g, '')
      : source;
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : source;
}
