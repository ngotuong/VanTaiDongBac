const PAYROLL_EXPLANATION_ACTIONS = new Set(['getPayrollExplanation']);
const MONTH_PATTERN = /^(0[1-9]|1[0-2])\/20\d{2}$/;
const PAYROLL_EXPLANATION_CONTRACT_VERSION = 'payroll-explanation-v6';

function employeeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/đ/g, 'd')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
}

function createPayrollExplanationService({ repository, workbookContextService, httpError, send }) {
  function handles(action) { return PAYROLL_EXPLANATION_ACTIONS.has(action); }

  async function handle(action, req, res, config, user) {
    if (!handles(action)) throw httpError(404, 'Action giải trình lương không hợp lệ.');
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    if (!user || (user.role !== 'admin' && user.role !== 'operator')) {
      throw httpError(403, 'Bạn không có quyền xem giải trình lương cá nhân.');
    }
    const reportMonth = String(req.query?.month || '').trim();
    if (!MONTH_PATTERN.test(reportMonth)) throw httpError(400, 'Tháng giải trình phải có dạng MM/YYYY.');
    const employeeName = String(req.query?.employee || '').trim();
    const normalizedEmployeeKey = employeeKey(employeeName);
    if (!normalizedEmployeeKey) throw httpError(400, 'Thiếu nhân sự cần giải trình.');
    const workbook = workbookContextService.resolve({ module: 'transport', year: req.query?.year });
    const [row, reportVersion] = await Promise.all([
      repository.findOne(config, workbook.spreadsheetId, reportMonth, normalizedEmployeeKey),
      repository.findReportVersion(config, workbook.spreadsheetId, reportMonth)
    ]);
    const cache = row ? {
      reconciliationStatus: row.reconciliation_status,
      sourceDataVersion: row.source_data_version,
      sourceHash: row.source_hash,
      syncedAt: row.synced_at
    } : null;
    const staleReasons = [];
    if (!row?.payload) staleReasons.push('missing');
    if (row?.payload && row.payload.contractVersion !== PAYROLL_EXPLANATION_CONTRACT_VERSION) staleReasons.push('contract-version');
    if (!reportVersion?.source_data_version) staleReasons.push('report-version-missing');
    if (row?.payload && reportVersion?.source_data_version && row.source_data_version !== reportVersion.source_data_version) staleReasons.push('source-data-version');
    if (staleReasons.length) {
      return send(res, 200, {
        ok: true,
        stale: true,
        explanation: null,
        refresh: { required: true, reasons: staleReasons },
        cache
      });
    }
    if (row.report_month !== reportMonth || row.employee_key !== normalizedEmployeeKey || row.spreadsheet_id !== workbook.spreadsheetId) {
      throw httpError(502, 'Cache giải trình lương trả về sai phạm vi yêu cầu.');
    }
    return send(res, 200, {
      ok: true,
      explanation: row.payload,
      stale: false,
      cache
    });
  }

  return { handles, handle };
}

module.exports = { createPayrollExplanationService, PAYROLL_EXPLANATION_ACTIONS, PAYROLL_EXPLANATION_CONTRACT_VERSION, employeeKey };
