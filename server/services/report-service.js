const REPORT_ACTIONS = new Set(['getReports', 'getReport', 'getReportBundle']);

function createReportService({ reportBundleRepository, appsScriptClient, workbookContextService, httpError, send }) {
  function handles(action) { return REPORT_ACTIONS.has(action); }

  async function forward(action, req, config, user, workbook) {
    const params = req.method === 'GET' ? { ...req.query } : { ...(req.body?.params || {}) };
    params.year = workbook.year;
    params.spreadsheetId = workbook.spreadsheetId;
    delete params.action;
    const body = req.method === 'POST' ? { ...(req.body || {}) } : {};
    delete body.action; delete body.params;
    return appsScriptClient.forward({ url: config.appsScriptUrl, action, method: req.method, params, body, proxySecret: config.proxySecret, requestUser: user });
  }

  async function handle(action, req, res, config, user) {
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    const resolveWorkbook = workbookContextService.resolveAsync || workbookContextService.resolve;
    const workbook = await resolveWorkbook.call(workbookContextService, { module: 'transport', year: req.query?.year });
    if (action !== 'getReportBundle') {
      const result = await forward(action, req, config, user, workbook);
      return send(res, result.status, result.body);
    }
    const month = String(req.query?.month || '').trim() || 'latest';
    const forceRefresh = String(req.query?.forceRefresh || '') === 'true';
    const spreadsheetId = workbook.spreadsheetId;
    if (!forceRefresh) {
      try {
        const row = await reportBundleRepository.findLatest(config, month, spreadsheetId);
        if (row?.payload) return send(res, 200, { ...row.payload, apiCached: true, supabaseCached: true, supabaseSyncedAt: row.synced_at });
      } catch (error) {
        throw httpError(503, error?.message || 'Không đọc được Báo cáo từ Supabase.');
      }
      throw httpError(503, 'Cache Báo cáo trên Supabase chưa sẵn sàng.');
    }
    const result = await forward(action, req, config, user, workbook);
    return send(res, result.status, result.body);
  }
  return { handles, handle };
}
module.exports = { createReportService, REPORT_ACTIONS };
