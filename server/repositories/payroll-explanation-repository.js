const { withDeadline } = require('../services/request-deadline');
function createPayrollExplanationRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  async function findOne(config, spreadsheetId, reportMonth, employeeKey) {
    const query = new URLSearchParams({
      select: 'spreadsheet_id,report_month,employee_key,employee_name,payload,reconciliation_status,source_data_version,source_hash,synced_at',
      spreadsheet_id: `eq.${String(spreadsheetId || '').trim()}`,
      report_month: `eq.${String(reportMonth || '').trim()}`,
      employee_key: `eq.${String(employeeKey || '').trim()}`,
      is_current: 'eq.true',
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/payroll_explanation_bundles_v6?${query.toString()}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được giải trình lương từ cache bảo mật.');
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function findReportVersion(config, spreadsheetId, reportMonth) {
    const query = new URLSearchParams({
      select: 'source_data_version,synced_at',
      spreadsheet_id: `eq.${String(spreadsheetId || '').trim()}`,
      report_month: `eq.${String(reportMonth || '').trim()}`,
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/report_bundles?${query.toString()}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw httpError(502, 'Không đọc được phiên bản Báo cáo từ cache bảo mật.');
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  return { findOne, findReportVersion };
}

module.exports = { createPayrollExplanationRepository };
