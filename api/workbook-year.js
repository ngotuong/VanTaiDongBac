const { createAppUserRepository } = require('../server/repositories/app-user-repository');
const { createWorkbookContextRepository } = require('../server/repositories/workbook-context-repository');
const { runtimeConfig } = require('../server/runtime-config');
const { createAuthService } = require('../server/services/auth-service');
const { createWorkbookContextService } = require('../server/services/workbook-context-service');
const { workbookYearCookie } = require('../server/services/workbook-year-cookie-service');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function assertSameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  const protocol = String(req.headers?.['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http'));
  if (!origin || !host || origin !== `${protocol}://${host}`) throw httpError(403, 'Yêu cầu chuyển năm không cùng origin.');
  if (String(req.headers?.['x-vtdb-csrf'] || '') !== 'workbook-year') throw httpError(403, 'Thiếu CSRF header chuyển năm hợp lệ.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  try {
    assertSameOrigin(req);
    if (!config.supabaseUrl || !config.anonKey) throw httpError(503, 'Auth chưa được cấu hình đầy đủ.');
    const repository = createAppUserRepository({ httpError });
    const auth = createAuthService({ appUserRepository: repository, httpError });
    await auth.getAuthenticatedUser(req, config);
    const year = String(req.body?.year || '').trim();
    const contexts = createWorkbookContextService({
      httpError,
      repository: createWorkbookContextRepository({ httpError }),
      config
    });
    const transport = await contexts.publicContextAsync({ module: 'transport', year });
    await contexts.publicContextAsync({ module: 'cashflow', year });
    res.setHeader('Set-Cookie', workbookYearCookie(year));
    return send(res, 200, { ok: true, workbook: transport });
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Không chuyển được năm dữ liệu.' });
  }
};
