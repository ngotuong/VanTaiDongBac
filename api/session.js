const { createAppUserRepository } = require('./repositories/app-user-repository');
const { runtimeConfig } = require('./runtime-config');
const { createAuthService } = require('./services/auth-service');
const {
  accessTokenFromRequest,
  refreshTokenFromRequest,
  sessionCookies,
  clearedSessionCookies,
  assertSameOrigin,
  refreshSession
} = require('./services/session-cookie-service');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = runtimeConfig();
  if (!config.supabaseUrl || !config.anonKey || !config.serviceRoleKey) return send(res, 503, { ok: false, error: 'Session server chưa được cấu hình đầy đủ.' });
  const repository = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: repository, httpError });
  try {
    if (req.method === 'DELETE') {
      assertSameOrigin(req, httpError);
      res.setHeader('Set-Cookie', clearedSessionCookies());
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST') {
      assertSameOrigin(req, httpError);
      const session = req.body?.session || {};
      if (!session.access_token || !session.refresh_token) throw httpError(400, 'Thiếu Supabase session để tạo server cookie.');
      const user = await auth.getAuthenticatedUser({ headers: { authorization: `Bearer ${session.access_token}` } }, config);
      res.setHeader('Set-Cookie', sessionCookies(session));
      return send(res, 200, { ok: true, user });
    }
    let token = accessTokenFromRequest(req);
    let refreshed = null;
    try {
      const user = await auth.getAuthenticatedUser({ headers: { authorization: token ? `Bearer ${token}` : '' } }, config);
      return send(res, 200, { ok: true, user });
    } catch (error) {
      if (error.status !== 401) throw error;
      refreshed = await refreshSession(fetch, config, refreshTokenFromRequest(req), httpError);
      token = refreshed.access_token;
    }
    const user = await auth.getAuthenticatedUser({ headers: { authorization: `Bearer ${token}` } }, config);
    res.setHeader('Set-Cookie', sessionCookies(refreshed));
    return send(res, 200, { ok: true, user });
  } catch (error) {
    if (error.status === 401) res.setHeader('Set-Cookie', clearedSessionCookies());
    return send(res, error.status || 500, { ok: false, error: error.message || 'Lỗi session server.' });
  }
};
