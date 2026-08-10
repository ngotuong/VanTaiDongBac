import 'server-only';

import { randomUUID } from 'node:crypto';

export function correlationIdFromHeaders(headerStore) {
  return String(headerStore.get('x-correlation-id') || headerStore.get('x-vercel-id') || randomUUID()).slice(0, 96);
}

export function logPlatformError(scope, error, correlationId) {
  console.error(JSON.stringify({
    level: 'error',
    scope: String(scope || 'next-platform'),
    correlationId: String(correlationId || ''),
    status: Number(error?.status) || 500,
    message: String(error?.message || 'Unknown platform error').slice(0, 240)
  }));
}
