const { createAppsScriptClient } = require('./services/apps-script-client');
const { createAuthorizationPolicy } = require('./services/authorization-policy');
const { createAuthService } = require('./services/auth-service');
const { createAccountService } = require('./services/account-service');
const { createAppUserRepository } = require('./repositories/app-user-repository');
const { createReportBundleRepository } = require('./repositories/report-bundle-repository');
const { createReportService } = require('./services/report-service');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = {
    supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: String(process.env.SUPABASE_ANON_KEY || ''),
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
    appsScriptUrl: String(process.env.APPS_SCRIPT_URL || ''),
    proxySecret: String(process.env.APP_PROXY_SECRET || '')
  };
  if (Object.values(config).some((value) => !value)) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình đầy đủ.' });

  const action = String(req.query?.action || req.body?.action || '').trim();
  if (!action) return send(res, 400, { ok: false, error: 'Thiếu action.' });
  try {
    let user = null;
    if (action !== 'health') user = await getAuthenticatedUser(req, config);
    if (action === 'authSession') return send(res, 200, { ok: true, user });
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
