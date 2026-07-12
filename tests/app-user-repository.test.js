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
