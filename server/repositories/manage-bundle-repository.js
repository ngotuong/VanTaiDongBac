const { withDeadline } = require('../services/request-deadline');
function createManageBundleRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  async function find(config, sheetName, filterKey) {
    const query = new URLSearchParams({
      select: 'sheet_name,filter_key,payload,synced_at',
      sheet_name: `eq.${String(sheetName || '').trim()}`,
      filter_key: `eq.${String(filterKey || 'recent_500').trim()}`,
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/manage_data_bundles?${query.toString()}`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: 'application/json' }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được dữ liệu Vận hành từ API cache.');
    return rows[0] || null;
  }
  return { find };
}
module.exports = { createManageBundleRepository };
