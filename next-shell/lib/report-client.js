/** @typedef {(method:'GET', action:string, params?:object) => Promise<any>} ReportTransport */
/** @param {ReportTransport} transport */
export function createReportClient(transport) {
  if (typeof transport !== 'function') throw new Error('Report transport is required.');
  return { getBundle: (month = 'latest', forceRefresh = false, spreadsheetId = '') => transport('GET', 'getReportBundle', { month, forceRefresh: forceRefresh ? 'true' : '', spreadsheetId }) };
}

export function createBrowserReportTransport(getAccessToken) {
  return async (_method, action, params = {}) => {
    const url = new URL('/api/app', window.location.origin);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => { if (value !== '') url.searchParams.set(key, String(value)); });
    const token = await getAccessToken();
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Không tải được báo cáo (${response.status}).`);
    return data;
  };
}
