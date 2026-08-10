'use client';

import { appendApiParams, parseApiResponse } from './api-contract';
import type { ApiRequestOptions } from './types';

export function createClientApiClient(fetchImpl: typeof fetch = fetch) {
  return {
    async get<T>(action: string, options: ApiRequestOptions = {}) {
      const url = appendApiParams(new URL('/api/app', window.location.origin), action, options.params);
      const response = await fetchImpl(url, { credentials: 'same-origin', signal: options.signal, headers: { 'X-VTDB-Client': 'next-platform' } });
      return parseApiResponse<T>(response);
    },
    async post<T>(action: string, options: ApiRequestOptions = {}) {
      const response = await fetchImpl('/api/app', {
        method: 'POST',
        credentials: 'same-origin',
        signal: options.signal,
        headers: { 'Content-Type': 'application/json', 'X-VTDB-Client': 'next-platform' },
        body: JSON.stringify({ action, params: options.params || {}, ...(options.body || {}) })
      });
      return parseApiResponse<T>(response);
    }
  };
}
