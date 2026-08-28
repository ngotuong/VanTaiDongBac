export function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSearchText(value: unknown) {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

export function splitSearchTerms(query: unknown) {
  return String(query ?? '')
    .split(/[,;|\n]+/)
    .map((term) => normalizeSearchText(term))
    .filter(Boolean);
}

/**
 * Match any comma/semicolon/newline-separated term against the supplied values.
 * A compact comparison makes vehicle plates resilient to dots, dashes and spaces.
 */
export function matchesSearchQuery(values: unknown | unknown[], query: unknown) {
  const terms = splitSearchTerms(query);
  if (!terms.length) return true;
  const source = Array.isArray(values) ? values.join(' ') : values;
  const text = normalizeSearchText(source);
  const compactText = compactSearchText(source);
  return terms.some((term) => {
    const compactTerm = compactSearchText(term);
    return text.includes(term) || Boolean(compactTerm && compactText.includes(compactTerm));
  });
}
