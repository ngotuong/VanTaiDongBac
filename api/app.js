const { createAppsScriptClient } = require('../server/services/apps-script-client');
const { createAuthorizationPolicy } = require('../server/services/authorization-policy');
const { createAuthService } = require('../server/services/auth-service');
const { createAccountService } = require('../server/services/account-service');
const { createAppUserRepository } = require('../server/repositories/app-user-repository');
const { createReportBundleRepository } = require('../server/repositories/report-bundle-repository');
const { createReportService } = require('../server/services/report-service');
const { createCatalogBundleRepository } = require('../server/repositories/catalog-bundle-repository');
const { createCatalogService } = require('../server/services/catalog-service');
const { createWorkbookContextService } = require('../server/services/workbook-context-service');
const { createNotificationBundleRepository } = require('../server/repositories/notification-bundle-repository');
const { createNotificationCenterService } = require('../server/services/notification-center-service');
const { createWriteJobRepository } = require('../server/repositories/write-job-repository');
const { createWriteCommandService } = require('../server/services/write-command-service');
const { createPayrollExplanationRepository } = require('../server/repositories/payroll-explanation-repository');
const { createPayrollExplanationService } = require('../server/services/payroll-explanation-service');
const { runtimeConfig } = require('../server/runtime-config');
const { assertBusinessWritesAvailable } = require('../server/services/business-maintenance-policy');
const { assertRuntimeIdentity, publicEnvironmentIdentity } = require('../server/environment-identity');

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
const catalogBundleRepository = createCatalogBundleRepository({
  httpError,
  fetchImpl: (request, init = {}) => fetch(request, { ...init, signal: AbortSignal.timeout(5000) })
});
const catalogService = createCatalogService({ catalogBundleRepository, appsScriptClient, httpError, send });
const workbookContextService = createWorkbookContextService({ httpError });
const notificationBundleRepository = createNotificationBundleRepository({ httpError });
const notificationCenterService = createNotificationCenterService({ repository: notificationBundleRepository, httpError, send });
const writeJobRepository = createWriteJobRepository({ httpError });
const writeCommandService = createWriteCommandService({
  repository: writeJobRepository,
  workbookContextService,
  httpError,
  send
});
const payrollExplanationRepository = createPayrollExplanationRepository({
  httpError,
  fetchImpl: (request, init = {}) => fetch(request, { ...init, signal: AbortSignal.timeout(5000) })
});
const payrollExplanationService = createPayrollExplanationService({
  repository: payrollExplanationRepository,
  workbookContextService,
  httpError,
  send
});

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  const action = String(req.query?.action || req.body?.action || '').trim();
  if (!action) return send(res, 400, { ok: false, error: 'Thiếu action.' });
  if (!config.supabaseUrl || !config.anonKey) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình Auth.' });
  const foundationAction = action === 'authSession' || action === 'runtimeContext';
  const serverOnlyDataAction = action === 'getNotifications' || action === 'getPayrollExplanation';
  const coreConfig = [config.supabaseUrl, config.anonKey, config.serviceRoleKey, config.appsScriptUrl, config.proxySecret];
  const requiredConfig = serverOnlyDataAction ? [config.supabaseUrl, config.anonKey, config.serviceRoleKey] : coreConfig;
  if (!foundationAction && requiredConfig.some((value) => !value)) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình đầy đủ.' });
  try {
    assertRuntimeIdentity(config);
    const environmentIdentity = publicEnvironmentIdentity(config);
    let user = null;
    if (action !== 'health') user = await getAuthenticatedUser(req, config);
    if (action === 'authSession') return send(res, 200, { ok: true, user });
    if (action === 'runtimeContext') {
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
      assertAuthorized(user, action);
      return send(res, 200, { ok: true, user, context: workbookContextService.publicContext(req.query || {}) });
    }
    assertAuthorized(user, action);
    assertBusinessWritesAvailable({ action, method: req.method, config, httpError });
    if (accountService.handles(action)) {
      return await accountService.handle(action, req, res, config, user);
    }
    if (reportService.handles(action)) {
      return await reportService.handle(action, req, res, config, user);
    }
    if (catalogService.handles(action)) {
      return await catalogService.handle(action, req, res, config, user);
    }
    if (notificationCenterService.handles(action)) {
      return await notificationCenterService.handle(action, req, res, config, user);
    }
    if (payrollExplanationService.handles(action)) {
      return await payrollExplanationService.handle(action, req, res, config, user);
    }
    if (writeCommandService.handles(action)) {
      return await writeCommandService.handle(action, req, res, config, user);
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
    if (action === 'health' && result.body && typeof result.body === 'object') {
      return send(res, result.status, { ...result.body, environmentIdentity, businessWritesPaused: config.businessWritesPaused === true });
    }
    return send(res, result.status, result.body);
  } catch (err) {
    return send(res, err.status || 500, { ok: false, error: err.message || 'Lỗi API proxy.' });
  }
};
