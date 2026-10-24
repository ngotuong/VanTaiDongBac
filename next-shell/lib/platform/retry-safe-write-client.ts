import type { ApiRequestOptions } from './types';

type WriteClient = { post<T>(action: string, options?: ApiRequestOptions): Promise<T> };

// Component-scoped: retain unresolved intents across retries and edits, without
// persisting business payloads in browser storage or sharing them across users.
export function createRetrySafeWriteClient(api: WriteClient, createId = () => `web-${crypto.randomUUID()}`) {
  const pending = new Map<string, string>();
  return {
    async post<T>(action: string, options: ApiRequestOptions = {}): Promise<T> {
      const body = { ...options.body };
      delete body.clientRequestId;
      const key = JSON.stringify({ action, params: options.params || {}, body }, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]])) : value);
      const clientRequestId = pending.get(key) || createId();
      pending.set(key, clientRequestId);
      const result = await api.post<T>(action, { ...options, body: { ...body, clientRequestId } });
      const response = result as { ok?: boolean; jobId?: string; job?: { jobId?: string } } | null;
      if (response?.ok === false || !(response?.jobId || response?.job?.jobId)) {
        throw new Error('Chưa xác nhận được mã lệnh ghi. Hãy kiểm tra hàng chờ trước khi gửi lại.');
      }
      pending.delete(key);
      return result;
    }
  };
}
