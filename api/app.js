const { createAppsScriptClient } = require('./services/apps-script-client');
const { createAuthorizationPolicy } = require('./services/authorization-policy');
const { createAuthService } = require('./services/auth-service');
const { createAccountService } = require('./services/account-service');
const { createAppUserRepository } = require('./repositories/app-user-repository');
const { createReportBundleRepository } = require('./repositories/report-bundle-repository');
const { createReportService } = require('./services/report-service');
const { createWorkbookContextService } = require('./services/workbook-context-service');
const { runtimeConfig } = require('./runtime-config');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const { assertAuthorized, assertAdmin } = createAuthorizationPolicy({ httpError });
const appUserRepository = createAppUserRepository({ httpError });
const { getAuthenticatedUser } = createAuthService({ appUserRepository, httpError });
const accountService = createAccountService({ appUserRepository, assertAdmin, httpError, send });
const appsScriptClient = createAppsScriptClient();
const reportBundleRepository = createReportBundleRepository({ httpError });
const reportService = createReportService({ reportBundleRepository, appsScriptClient, httpError, send });
const workbookContextService = createWorkbookContextService({ httpError });

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  const action = String(req.query?.action || req.body?.action || '').trim();
  if (!action) return send(res, 400, { ok: false, error: 'Thiếu action.' });
  if (!config.supabaseUrl || !config.anonKey) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình Auth.' });
  const foundationAction = action === 'authSession' || action === 'runtimeContext';
  if (!foundationAction && Object.values(config).some((value) => !value)) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình đầy đủ.' });
  try {
    let user = null;
    if (action !== 'health') user = await getAuthenticatedUser(req, config);
    if (action === 'authSession') return send(res, 200, { ok: true, user });
    if (action === 'runtimeContext') {
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
      assertAuthorized(user, action);
      return send(res, 200, { ok: true, user, context: workbookContextService.publicContext(req.query || {}) });
    }
    assertAuthorized(user, action);
    if (accountService.handles(action)) {
      return accountService.handle(action, req, res, config, user);
    }
    if (reportService.handles(action)) {
      return reportService.handle(action, req, res, config, user);
    }

    const params = req.method === 'GET' ? { ...req.query } : { ...(req.body?.params || {}) };
    delete params.action;
    const body = req.method === 'POST' ? { ...(req.body || {}) } : {};
    delete body.action;
    delete body.params;
    const client = appsScriptClient;
    const result = await client.forward({
      url: config.appsScriptUrl,
      action,
      method: req.method,
      params,
      body,
      proxySecret: config.proxySecret,
      requestUser: user
    });
    return send(res, result.status, result.body);
  } catch (err) {
    return send(res, err.status || 500, { ok: false, error: err.message || 'Lỗi API proxy.' });
  }
};
