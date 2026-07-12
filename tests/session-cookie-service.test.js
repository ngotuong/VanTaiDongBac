const assert = require('node:assert/strict');
const test = require('node:test');
const {
  accessTokenFromRequest,
  refreshTokenFromRequest,
  sessionCookies,
  clearedSessionCookies,
  assertSameOrigin,
  refreshSession
} = require('../api/services/session-cookie-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });

test('session cookies are HttpOnly Strict and never use browser-readable storage', () => {
  const values = sessionCookies({ access_token: 'access', refresh_token: 'refresh', expires_in: 300 }, { secure: true });
  assert.equal(values.length, 2);
  for (const value of values) assert.match(value, /HttpOnly; SameSite=Strict; Secure; Max-Age=/);
  assert.equal(accessTokenFromRequest({ headers: { cookie: values[0].split(';')[0] } }), 'access');
  assert.equal(refreshTokenFromRequest({ headers: { cookie: values[1].split(';')[0] } }), 'refresh');
  for (const value of clearedSessionCookies({ secure: true })) assert.match(value, /Max-Age=0/);
});

test('session mutation requires same origin and explicit CSRF header', () => {
  const request = { headers: { origin: 'https://app.example', host: 'app.example', 'x-forwarded-proto': 'https', 'x-vtdb-csrf': 'session' } };
  assert.doesNotThrow(() => assertSameOrigin(request, httpError));
  assert.throws(() => assertSameOrigin({ headers: { ...request.headers, origin: 'https://evil.example' } }, httpError), { status: 403 });
  assert.throws(() => assertSameOrigin({ headers: { ...request.headers, 'x-vtdb-csrf': '' } }, httpError), { status: 403 });
});

test('refresh session exchanges only the HttpOnly refresh token with Supabase', async () => {
  let call;
  const session = await refreshSession(async (...args) => {
    call = args;
    return { ok: true, json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh' }) };
  }, { supabaseUrl: 'https://example.supabase.co', anonKey: 'anon' }, 'old-refresh', httpError);
  assert.equal(session.access_token, 'new-access');
  assert.equal(call[0], 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(JSON.parse(call[1].body), { refresh_token: 'old-refresh' });
});
