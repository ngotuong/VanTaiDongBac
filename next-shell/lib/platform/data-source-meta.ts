export type DataSource = 'supabase' | 'apps-script';

export type DataSourcePayload = {
  supabaseCached?: boolean;
  supabaseSyncedAt?: string;
  updatedAt?: string;
};

export type DataSourceMeta = {
  updatedAt: string;
  source: DataSource;
  path?: string;
};

function formatTimestamp(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

export function dataSourceMeta(payload?: DataSourcePayload | null, explicitSource?: DataSource): DataSourceMeta | null {
  if (!payload && !explicitSource) return null;
  const source = explicitSource || (payload?.supabaseCached ? 'supabase' : 'apps-script');
  const rawTimestamp = source === 'supabase' ? (payload?.supabaseSyncedAt || payload?.updatedAt) : payload?.updatedAt;
  return { updatedAt: formatTimestamp(rawTimestamp), source };
}

export function publishDataSourceMeta(payload?: DataSourcePayload | null, explicitSource?: DataSource) {
  if (typeof window === 'undefined') return;
  const meta = dataSourceMeta(payload, explicitSource);
  if (!meta) return;
  window.dispatchEvent(new CustomEvent('vtdb:dashboard-meta', {
    detail: { ...meta, path: window.location.pathname }
  }));
}
