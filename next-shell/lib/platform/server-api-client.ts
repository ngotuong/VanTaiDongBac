import 'server-only';

import { cookies, headers } from 'next/headers';
import { appendApiParams, parseApiResponse } from './api-contract';
import type { ApiRequestOptions } from './types';

export async function createServerApiClient(fetchImpl: typeof fetch = fetch) {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host');
  const protocol = headerStore.get('x-forwarded-proto') || 'https';
  if (!host) throw new Error('Không xác định được API origin.');
  const origin = `${protocol}://${host}`;
  const sharedHeaders = {
    cookie: cookieStore.toString(),
    'X-Correlation-ID': headerStore.get('x-correlation-id') || headerStore.get('x-vercel-id') || '',
    'X-VTDB-Client': 'next-platform-server'
  };

  return {
    async get<T>(action: string, options: ApiRequestOptions = {}) {
      const url = appendApiParams(new URL('/api/app', origin), action, options.params);
      const response = await fetchImpl(url, { cache: 'no-store', signal: options.signal, headers: sharedHeaders });
      return parseApiResponse<T>(response);
    }
  };
}
