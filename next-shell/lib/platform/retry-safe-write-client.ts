import type { ApiRequestOptions } from './types';

type WriteClient = { post<T>(action: string, options?: ApiRequestOptions): Promise<T> };

export function requiresWriteReconciliation(error: unknown) {
  return /^(?:REQUIRES_RECONCILIATION:|Dòng \d+ đã thay đổi sau khi tạo job|Dòng Thu chi đã thay đổi)/.test(String(error || '').trim());
}

export function createRetrySafeWriteClient(
  api: WriteClient,
  createId = () => `web-${crypto.randomUUID()}`,
  scope?: { userId: string; year: string }
) {
  const pending = new Map<string, string>();
  return {
    async post<T>(action: string, options: ApiRequestOptions = {}): Promise<T> {
      const body = { ...options.body };
      const supplied = typeof body.clientRequestId === 'string' ? body.clientRequestId : '';
      delete body.clientRequestId;
      const key = JSON.stringify({ action, params: options.params || {}, body }, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]])) : value);
      // Keep only a fingerprint and the unresolved request ID in this tab.
      let storage: Storage | undefined;
      let storageKey = '';
      if (scope?.userId && typeof window !== 'undefined') {
        try {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scope.userId, scope.year, key])));
          storageKey = 'vtdb:pending-write:' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
          storage = window.sessionStorage;
        } catch {}
      }
      let savedId: string | null = null;
      try { savedId = storage?.getItem(storageKey) || null; } catch {}
      const clientRequestId = savedId || pending.get(key) || supplied || createId();
      pending.set(key, clientRequestId);
      try { storage?.setItem(storageKey, clientRequestId); } catch {}
      const result = await api.post<T>(action, { ...options, body: { ...body, clientRequestId } });
      const response = result as { ok?: boolean; jobId?: string; job?: { jobId?: string } } | null;
      if (response?.ok === false || !(response?.jobId || response?.job?.jobId)) {
        throw new Error('Chưa xác nhận được mã lệnh ghi. Hãy kiểm tra hàng chờ trước khi gửi lại.');
      }
      if (pending.get(key) === clientRequestId) pending.delete(key);
      try {
        if (storage?.getItem(storageKey) === clientRequestId) storage.removeItem(storageKey);
      } catch {}
      return result;
    }
  };
}
