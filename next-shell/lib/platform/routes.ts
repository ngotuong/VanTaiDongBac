export function normalizeRoutePath(value: string | null | undefined) {
  const raw = String(value || '/').split(/[?#]/, 1)[0] || '/';
  const normalized = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return normalized === '/' ? '/dashboard' : normalized;
}

export function routesEqual(left: string | null | undefined, right: string | null | undefined) {
  return normalizeRoutePath(left) === normalizeRoutePath(right);
}
