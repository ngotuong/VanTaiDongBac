const assert = require('node:assert/strict');
const test = require('node:test');
const { createPushSubscriptionRepository, hashEndpoint } = require('../server/repositories/push-subscription-repository');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = { supabaseUrl: 'https://cache.example', serviceRoleKey: 'service-secret' };
const endpoint = 'https://push.example/subscription/device-one';

test('PushSubscriptionRepository hashes endpoints and never filters by raw endpoint', async () => {
  const requests = [];
  const repository = createPushSubscriptionRepository({
    httpError,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => [] };
    }
  });
  await repository.findByUserAndEndpoint(config, 'user-1', endpoint);
  assert.equal(hashEndpoint(endpoint).length, 64);
  assert.match(requests[0].url, new RegExp(`endpoint_hash=eq\\.${hashEndpoint(endpoint)}`));
  assert.doesNotMatch(requests[0].url, /push\.example/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer service-secret');
});

test('PushSubscriptionRepository upserts one server-only row per user and endpoint hash', async () => {
  let request;
  const repository = createPushSubscriptionRepository({
    httpError,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201, json: async () => [{ id: 'subscription-1' }] };
    }
  });
  const result = await repository.upsert(config, 'user-1', {
    endpoint,
    keys: { p256dh: 'public-device-key', auth: 'device-auth-secret' }
  }, 'Test Browser', '2026-07-30T12:00:00.000Z');
  assert.equal(result.id, 'subscription-1');
  assert.match(request.url, /on_conflict=user_id(?:%2C|,)endpoint_hash/);
  assert.equal(request.options.method, 'POST');
  assert.match(request.options.headers.Prefer, /resolution=merge-duplicates/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.user_id, 'user-1');
  assert.equal(body.endpoint_hash, hashEndpoint(endpoint));
  assert.equal(body.endpoint, endpoint);
  assert.equal(body.auth_secret, 'device-auth-secret');
});

test('PushSubscriptionRepository delete is scoped by both current user and endpoint hash', async () => {
  let request;
  const repository = createPushSubscriptionRepository({
    httpError,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, json: async () => ({}) };
    }
  });
  await repository.remove(config, 'user-1', endpoint);
  assert.equal(request.options.method, 'DELETE');
  assert.match(request.url, /user_id=eq\.user-1/);
  assert.match(request.url, new RegExp(`endpoint_hash=eq\\.${hashEndpoint(endpoint)}`));
});

test('PushSubscriptionRepository lists devices only for selected recipient user ids', async () => {
  const requests = [];
  const repository = createPushSubscriptionRepository({
    httpError,
    async fetchImpl(url, init) {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => [{ id: 'sub-1', user_id: 'admin-1' }] };
    }
  });
  const rows = await repository.listByUserIds(config, ['admin-1', 'shareholder-1', 'admin-1']);
  assert.equal(rows.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get('user_id'), 'in.("admin-1","shareholder-1")');
  assert.match(url.searchParams.get('select'), /auth_secret/);
});
