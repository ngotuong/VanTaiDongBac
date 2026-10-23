const YEAR_ROLLOVER_ACTIONS = new Set(['getYearRolloverStatus', 'manageYearRollover']);
const OPERATIONS = new Set(['preview', 'canary', 'provision', 'resume', 'audit', 'prepare', 'activate']);

function createYearRolloverService({ appsScriptClient, assertAdmin, assertSameOrigin, httpError, send }) {
  function handles(action) { return YEAR_ROLLOVER_ACTIONS.has(action); }

  async function handle(action, req, res, config, user) {
    assertAdmin(user);
    if (action === 'getYearRolloverStatus' && req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    if (action === 'manageYearRollover' && req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    if (action === 'manageYearRollover') assertSameOrigin(req, httpError);
    const params = action === 'getYearRolloverStatus' ? {
      sourceYear: String(req.query?.sourceYear || '').trim(),
      targetYear: String(req.query?.targetYear || '').trim()
    } : {};
    const body = action === 'manageYearRollover' ? { ...(req.body || {}) } : {};
    delete body.action;
    delete body.params;
    if (action === 'manageYearRollover') {
      const operation = String(body.operation || '').trim();
      if (!OPERATIONS.has(operation)) throw httpError(400, 'Thao tác chuyển năm không hợp lệ.');
      if (operation === 'activate' && !config.businessWritesPaused) {
        throw httpError(409, 'Phải bật chế độ bảo trì lệnh ghi trước khi kích hoạt năm mới.');
      }
    }
    const result = await appsScriptClient.forward({
      url: config.appsScriptUrl,
      action,
      method: req.method,
      params,
      body,
      proxySecret: config.proxySecret,
      requestUser: user
    });
    return send(res, result.status, result.body);
  }

  return { handles, handle };
}

module.exports = { createYearRolloverService, YEAR_ROLLOVER_ACTIONS, OPERATIONS };
