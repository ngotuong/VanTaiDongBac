const { withDeadline } = require('../services/request-deadline');
function createReportBundleRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  async function findLatest(config, month, spreadsheetId) {
    const normalizedMonth = String(month || '').trim() || 'latest';
    const query = new URLSearchParams({
      select: 'spreadsheet_id,report_month,payload,synced_at',
      order: 'synced_at.desc',
      limit: '1'
    });
    // `latest` is a request alias, not a persisted report_month value. Dashboard
    // snapshots share this table, so they must never satisfy a Report lookup.
    query.set('report_month', normalizedMonth === 'latest'
      ? 'neq.__dashboard_latest__'
      : `eq.${normalizedMonth}`);
    if (spreadsheetId) query.set('spreadsheet_id', `eq.${String(spreadsheetId).trim()}`);
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/report_bundles?${query.toString()}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được report bundle từ API cache.');
    return rows[0] || null;
  }

  async function findMonths(config, months, spreadsheetId) {
    const normalizedMonths = [...new Set((months || []).map((month) => String(month || '').trim()).filter(Boolean))];
    if (!normalizedMonths.length) return [];
    const query = new URLSearchParams({
      select: 'spreadsheet_id,report_month,payload,synced_at',
      report_month: `in.(${normalizedMonths.join(',')})`,
      order: 'report_month.asc',
      limit: String(normalizedMonths.length)
    });
    if (spreadsheetId) query.set('spreadsheet_id', `eq.${String(spreadsheetId).trim()}`);
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/report_bundles?${query.toString()}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được các report bundle theo khoảng tháng.');
    return Array.isArray(rows) ? rows : [];
  }
  return { findLatest, findMonths };
}
module.exports = { createReportBundleRepository };
