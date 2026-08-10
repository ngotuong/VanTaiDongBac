const assert = require('node:assert/strict');
const test = require('node:test');

const handler = require('../api/push');

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

async function withEnvironment(fetchImpl, fn) {
  const previousFetch = global.fetch;
  const keys = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT'
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  global.fetch = fetchImpl;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://auth.example',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    WEB_PUSH_VAPID_PUBLIC_KEY: 'public-vapid',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'private-vapid',
    WEB_PUSH_VAPID_SUBJECT: 'https://dongbac.vercel.app'
  });
  try { return await fn(); } finally {
    global.fetch = previousFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function authenticatedFetch(url) {
  if (url.includes('/auth/v1/user')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'user-1' }) });
  if (url.includes('/rest/v1/app_users')) return Promise.resolve({ ok: true, status: 200, json: async () => [{ user_id: 'user-1', username: 'operator', email: 'operator@dongbac.internal', role: 'operator', active: true }] });
  if (url.includes('/rest/v1/web_push_subscriptions')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
  if (url.includes('/rest/v1/notification_preferences')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
  throw new Error(`Unexpected URL: ${url}`);
}

test('GET push status authenticates the HttpOnly session and returns only public configuration', { concurrency: false }, async () => {
  await withEnvironment(authenticatedFetch, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: { cookie: 'vtdb_access_token=user-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.publicKey, 'public-vapid');
    assert.equal(res.body.deviceCount, 0);
    assert.equal('vapidPrivateKey' in res.body, false);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });
});

test('POST push mutation rejects a valid user request without same-origin CSRF proof', { concurrency: false }, async () => {
  await withEnvironment(authenticatedFetch, async () => {
    const res = createResponse();
    await handler({
      method: 'POST',
      headers: { cookie: 'vtdb_access_token=user-token', host: 'preview.example', origin: 'https://evil.example' },
      body: { action: 'unsubscribe', endpoint: 'https://push.example/device' }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /cùng origin/);
  });
});

test('push endpoint rejects unauthenticated reads', { concurrency: false }, async () => {
  await withEnvironment(async (url) => {
    if (url.includes('/auth/v1/user')) return { ok: false, status: 401, json: async () => ({}) };
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 401);
  });
});
