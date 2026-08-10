import type { ApiRequestOptions } from './types';

export class PlatformApiError extends Error {
  status: number;
  correlationId: string;

  constructor(message: string, status = 500, correlationId = '') {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
    this.correlationId = correlationId;
  }
}

export function appendApiParams(url: URL, action: string, params: ApiRequestOptions['params'] = {}) {
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; correlationId?: string };
  if (!response.ok || payload.ok === false) {
    throw new PlatformApiError(payload.error || `API request failed (${response.status}).`, response.status, payload.correlationId || '');
  }
  return payload as T;
}
