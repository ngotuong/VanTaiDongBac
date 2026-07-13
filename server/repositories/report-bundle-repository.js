function createReportBundleRepository({ fetchImpl = fetch, httpError }) {
  async function findLatest(config, month, spreadsheetId) {
    const normalizedMonth = String(month || '').trim() || 'latest';
    const query = new URLSearchParams({
      select: 'spreadsheet_id,report_month,payload,synced_at',
      order: 'synced_at.desc',
      limit: '1'
    });
    // `latest` is a request alias, not a persisted report_month value.
    if (normalizedMonth !== 'latest') query.set('report_month', `eq.${normalizedMonth}`);
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
  return { findLatest };
}
module.exports = { createReportBundleRepository };
