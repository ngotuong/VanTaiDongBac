const REPORT_ACTIONS = new Set(['getReports', 'getReport', 'getReportBundle']);

function createReportService({ reportBundleRepository, appsScriptClient, httpError, send }) {
  function handles(action) { return REPORT_ACTIONS.has(action); }

  async function forward(action, req, config, user) {
    const params = req.method === 'GET' ? { ...req.query } : { ...(req.body?.params || {}) };
    delete params.action;
    const body = req.method === 'POST' ? { ...(req.body || {}) } : {};
    delete body.action; delete body.params;
    return appsScriptClient.forward({ url: config.appsScriptUrl, action, method: req.method, params, body, proxySecret: config.proxySecret, requestUser: user });
  }

  async function handle(action, req, res, config, user) {
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    if (action !== 'getReportBundle') {
      const result = await forward(action, req, config, user);
      return send(res, result.status, result.body);
    }
    const month = String(req.query?.month || '').trim() || 'latest';
    const forceRefresh = String(req.query?.forceRefresh || '') === 'true';
    const spreadsheetId = String(req.query?.spreadsheetId || '').trim();
    if (!forceRefresh) {
      try {
        const row = await reportBundleRepository.findLatest(config, month, spreadsheetId);
        if (row?.payload) return send(res, 200, { ...row.payload, apiCached: true, supabaseCached: true, supabaseSyncedAt: row.synced_at });
      } catch (error) {
        // Cache is an optimization; Apps Script remains the compatibility fallback.
      }
    }
    const result = await forward(action, req, config, user);
    return send(res, result.status, result.body);
  }
  return { handles, handle };
}
module.exports = { createReportService, REPORT_ACTIONS };
