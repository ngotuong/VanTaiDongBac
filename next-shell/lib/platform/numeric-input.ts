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
