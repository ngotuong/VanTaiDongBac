const { withDeadline } = require('../services/request-deadline');

function createWorkbookContextRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);

  async function list(config) {
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/workbook_contexts?select=year,transport_spreadsheet_id,cashflow_spreadsheet_id,lifecycle_status,source_year,workbook_names,audit_summary,prepared_at,activated_at,updated_at&order=year.desc`,
      { headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json'
      }}
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(data.message || data.error || data.msg || 'Không đọc được registry workbook.');
      // Migration 020 is additive. Before it is applied, the existing Vercel
      // allowlist remains the exact rollback-compatible source.
      if (response.status === 404 && /workbook_contexts|schema cache|could not find/i.test(message)) return [];
      throw httpError(response.status >= 400 && response.status < 500 ? response.status : 503, message);
    }
    return Array.isArray(data) ? data : [];
  }

  return { list };
}

module.exports = { createWorkbookContextRepository };
