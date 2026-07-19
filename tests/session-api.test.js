const assert = require('node:assert/strict');
const test = require('node:test');

const handler = require('../api/session');

const jwt = (expiresAt) => `header.${Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url')}.signature`;
const response = (ok, status, body) => ({ ok, status, json: async () => body });

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

async function withSessionEnvironment(fetchImpl, fn) {
  const previousFetch = global.fetch;
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  global.fetch = fetchImpl;
  process.env.SUPABASE_URL = 'https://auth.example';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  try {
    return await fn();
  } finally {
    global.fetch = previousFetch;
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test('GET session proactively rotates an expiring access token and returns the same active user', { concurrency: false }, async () => {
  const now = Math.floor(Date.now() / 1000);
  const oldAccess = jwt(now + 60);
  const newAccess = jwt(now + 3600);
  const calls = [];
  await withSessionEnvironment(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/token')) return response(true, 200, { access_token: newAccess, refresh_token: 'new-refresh', expires_in: 3600 });
    if (url.includes('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, `Bearer ${newAccess}`);
      return response(true, 200, { id: 'user-1' });
    }
    if (url.includes('/rest/v1/app_users')) return response(true, 200, [{ user_id: 'user-1', username: 'admin', email: 'admin@example', role: 'admin', active: true, display_name: 'Admin' }]);
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: { cookie: `vtdb_access_token=${encodeURIComponent(oldAccess)}; vtdb_refresh_token=old-refresh` } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.username, 'admin');
    assert.equal(Array.isArray(res.headers['Set-Cookie']), true);
    assert.equal(res.headers['Set-Cookie'].length, 2);
    assert.equal(calls.filter((call) => call.url.includes('/auth/v1/token')).length, 1);
  });
});

test('GET session keeps a healthy access token without rotating cookies', { concurrency: false }, async () => {
  const access = jwt(Math.floor(Date.now() / 1000) + 3600);
  let refreshCalls = 0;
  await withSessionEnvironment(async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) { refreshCalls += 1; return response(true, 200, {}); }
    if (url.includes('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, `Bearer ${access}`);
      return response(true, 200, { id: 'user-1' });
    }
    if (url.includes('/rest/v1/app_users')) return response(true, 200, [{ user_id: 'user-1', username: 'operator', email: 'operator@example', role: 'operator', active: true }]);
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: { cookie: `vtdb_access_token=${encodeURIComponent(access)}; vtdb_refresh_token=refresh` } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(refreshCalls, 0);
    assert.equal(res.headers['Set-Cookie'], undefined);
  });
});

test('GET session keeps a still-valid access token when proactive refresh is temporarily unavailable', { concurrency: false }, async () => {
  const access = jwt(Math.floor(Date.now() / 1000) + 10 * 60);
  await withSessionEnvironment(async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) return response(false, 503, { error: 'temporary outage' });
    if (url.includes('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, `Bearer ${access}`);
      return response(true, 200, { id: 'user-1' });
    }
    if (url.includes('/rest/v1/app_users')) return response(true, 200, [{ user_id: 'user-1', username: 'admin', email: 'admin@example', role: 'admin', active: true }]);
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: { cookie: `vtdb_access_token=${encodeURIComponent(access)}; vtdb_refresh_token=refresh` } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.username, 'admin');
    assert.equal(res.headers['Set-Cookie'], undefined);
  });
});

test('GET session clears cookies only when both refresh and access authentication fail', { concurrency: false }, async () => {
  const expired = jwt(Math.floor(Date.now() / 1000) - 60);
  await withSessionEnvironment(async (url) => {
    if (url.includes('/auth/v1/token')) return response(false, 400, { error: 'invalid refresh' });
    if (url.includes('/auth/v1/user')) return response(false, 401, {});
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: { cookie: `vtdb_access_token=${encodeURIComponent(expired)}; vtdb_refresh_token=invalid` } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.headers['Set-Cookie'].every((value) => /Max-Age=0/.test(value)), true);
  });
});
