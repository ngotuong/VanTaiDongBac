const ACCESS_COOKIE = 'vtdb_access_token';
const REFRESH_COOKIE = 'vtdb_refresh_token';
const COOKIE_MAX_AGE = 60 * 60;
// Keep this wider than the client keepalive jitter so a 40-minute heartbeat
// reliably rotates the default one-hour Supabase access token.
const ACCESS_REFRESH_WINDOW_SECONDS = 25 * 60;

function parseCookies(header = '') {
  return String(header).split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 0) return cookies;
    const key = part.slice(0, index).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // A malformed cookie must not take down all authenticated endpoints.
      // An invalid auth value is absent, allowing the normal refresh/401 path.
    }
    return cookies;
  }, {});
}

function cookie(name, value, options = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    options.secure ? 'Secure' : '',
    `Max-Age=${options.maxAge ?? COOKIE_MAX_AGE}`
  ].filter(Boolean);
  return attributes.join('; ');
}

function sessionCookies(session, { secure = process.env.NODE_ENV === 'production' } = {}) {
  const expiresIn = Math.max(60, Math.min(Number(session.expires_in) || COOKIE_MAX_AGE, COOKIE_MAX_AGE));
  return [
    cookie(ACCESS_COOKIE, String(session.access_token || ''), { secure, maxAge: expiresIn }),
    cookie(REFRESH_COOKIE, String(session.refresh_token || ''), { secure, maxAge: 60 * 60 * 24 * 30 })
  ];
}

function clearedSessionCookies({ secure = process.env.NODE_ENV === 'production' } = {}) {
  return [cookie(ACCESS_COOKIE, '', { secure, maxAge: 0 }), cookie(REFRESH_COOKIE, '', { secure, maxAge: 0 })];
}

function accessTokenFromRequest(req) {
  return parseCookies(req?.headers?.cookie)[ACCESS_COOKIE] || '';
}

function refreshTokenFromRequest(req) {
  return parseCookies(req?.headers?.cookie)[REFRESH_COOKIE] || '';
}

function accessTokenExpiresWithin(token, windowSeconds = ACCESS_REFRESH_WINDOW_SECONDS, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expiresAt = Number(payload.exp || 0);
    return !expiresAt || expiresAt - Number(nowSeconds) <= Math.max(0, Number(windowSeconds) || 0);
  } catch {
    return true;
  }
}

function assertSameOrigin(req, httpError) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  const protocol = String(req.headers?.['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http'));
  if (!origin || !host || origin !== `${protocol}://${host}`) throw httpError(403, 'Yêu cầu session không cùng origin.');
  if (String(req.headers?.['x-vtdb-csrf'] || '') !== 'session') throw httpError(403, 'Thiếu CSRF header hợp lệ.');
}

async function refreshSession(fetchImpl, config, refreshToken, httpError) {
  if (!refreshToken || !config.supabaseUrl || !config.supabaseUrl.startsWith('http')) throw httpError(401, 'Phiên đăng nhập đã hết hạn.');
  const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.access_token || !session.refresh_token) throw httpError(401, 'Không thể làm mới phiên đăng nhập.');
  return session;
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessTokenFromRequest,
  refreshTokenFromRequest,
  accessTokenExpiresWithin,
  sessionCookies,
  clearedSessionCookies,
  assertSameOrigin,
  refreshSession
};
