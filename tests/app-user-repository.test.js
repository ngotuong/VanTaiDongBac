const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppUserRepository } = require('../api/repositories/app-user-repository');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'service-secret' };

test('AppUserRepository reads one active allowlist profile with server credentials', async () => {
  let request;
  const repository = createAppUserRepository({
    httpError,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => [{ user_id: 'user/1', username: 'tester' }] };
    }
  });
  const profile = await repository.findActiveByUserId(config, 'user/1');
  assert.equal(profile.username, 'tester');
  assert.match(request.url, /app_users\?select=user_id,username,email,role,active,display_name/);
  assert.match(request.url, /user_id=eq\.user%2F1&active=eq\.true&limit=1/);
  assert.equal(request.options.headers.apikey, 'service-secret');
  assert.equal(request.options.headers.Authorization, 'Bearer service-secret');
});

test('AppUserRepository returns null for an empty allowlist result', async () => {
  const repository = createAppUserRepository({ httpError, fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  assert.equal(await repository.findActiveByUserId(config, 'missing'), null);
});

test('AppUserRepository preserves Supabase client errors and masks server errors', async () => {
  const clientRepository = createAppUserRepository({
    httpError,
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ message: 'conflict' }) })
  });
  await assert.rejects(() => clientRepository.findActiveByUserId(config, 'one'), { status: 409, message: 'conflict' });

  const serverRepository = createAppUserRepository({
    httpError,
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('invalid json'); } })
  });
  await assert.rejects(() => serverRepository.findActiveByUserId(config, 'one'), {
    status: 500,
    message: 'Không kiểm tra được danh sách người dùng nội bộ.'
  });
});

test('AppUserRepository preserves account list, create, and update REST contracts', async () => {
  const requests = [];
  const responses = [
    [{ user_id: 'one' }],
    [{ user_id: 'two' }],
    [{ user_id: 'three' }]
  ];
  const repository = createAppUserRepository({
    httpError,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => responses.shift() };
    }
  });
  assert.deepEqual(await repository.list(config), [{ user_id: 'one' }]);
  assert.deepEqual(await repository.create(config, { user_id: 'two' }), { user_id: 'two' });
  assert.deepEqual(await repository.update(config, 'user/three', { role: 'operator' }), { user_id: 'three' });

  assert.match(requests[0].url, /select=user_id,username,display_name,role,active,created_at&order=created_at\.asc/);
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers.Prefer, 'return=representation');
  assert.equal(requests[1].options.body, JSON.stringify({ user_id: 'two' }));
  assert.match(requests[2].url, /user_id=eq\.user%2Fthree/);
  assert.equal(requests[2].options.method, 'PATCH');
  assert.equal(requests[2].options.body, JSON.stringify({ role: 'operator' }));
});
