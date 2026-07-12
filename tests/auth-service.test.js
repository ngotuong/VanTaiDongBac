const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthService } = require('../api/services/auth-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = { supabaseUrl: 'https://example.supabase.co', anonKey: 'anon-key' };

test('AuthService requires a bearer token before calling Supabase', async () => {
  const service = createAuthService({
    httpError,
    fetchImpl: async () => { throw new Error('must not fetch'); },
    appUserRepository: { findActiveByUserId: async () => { throw new Error('must not read profile'); } }
  });
  await assert.rejects(() => service.getAuthenticatedUser({ headers: {} }, config), {
    status: 401,
    message: 'Vui lòng đăng nhập để tiếp tục.'
  });
});

test('AuthService maps invalid Supabase sessions to the existing 401 contract', async () => {
  const service = createAuthService({
    httpError,
    fetchImpl: async () => ({ ok: false }),
    appUserRepository: { findActiveByUserId: async () => null }
  });
  await assert.rejects(() => service.getAuthenticatedUser({ headers: { authorization: 'Bearer expired' } }, config), {
    status: 401,
    message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
  });
});

test('AuthService rejects users outside the active allowlist', async () => {
  const service = createAuthService({
    httpError,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'user-1' }) }),
    appUserRepository: { findActiveByUserId: async () => null }
  });
  await assert.rejects(() => service.getAuthenticatedUser({ headers: { authorization: 'Bearer valid' } }, config), {
    status: 403,
    message: 'Tài khoản này chưa được cấp quyền sử dụng hệ thống.'
  });
});

test('AuthService returns the existing request-user shape and display-name fallback', async () => {
  let lookup;
  const service = createAuthService({
    httpError,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${config.supabaseUrl}/auth/v1/user`);
      assert.deepEqual(options.headers, { apikey: 'anon-key', Authorization: 'Bearer valid' });
      return { ok: true, json: async () => ({ id: 'user-1' }) };
    },
    appUserRepository: {
      findActiveByUserId: async (receivedConfig, userId) => {
        lookup = { receivedConfig, userId };
        return { username: 'tester', email: 'tester@dongbac.internal', role: 'operator', display_name: '' };
      }
    }
  });
  const user = await service.getAuthenticatedUser({ headers: { authorization: 'Bearer valid' } }, config);
  assert.deepEqual(lookup, { receivedConfig: config, userId: 'user-1' });
  assert.deepEqual(user, {
    id: 'user-1', username: 'tester', email: 'tester@dongbac.internal', role: 'operator', displayName: 'tester'
  });
});

test('AuthService accepts the server HttpOnly cookie when bearer header is absent', async () => {
  const service = createAuthService({
    httpError,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer cookie-token');
      return { ok: true, json: async () => ({ id: 'user-1' }) };
    },
    appUserRepository: { findActiveByUserId: async () => ({ username: 'tester', email: 'tester@dongbac.internal', role: 'operator' }) }
  });
  const user = await service.getAuthenticatedUser({ headers: { cookie: 'vtdb_access_token=cookie-token' } }, config);
  assert.equal(user.username, 'tester');
});

test('AuthService prefers authenticated RLS profile lookup for the current user', async () => {
  let lookup;
  const service = createAuthService({
    httpError,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'user-1' }) }),
    appUserRepository: {
      findActiveByUserIdWithToken: async (...args) => {
        lookup = args;
        return { username: 'tester', email: 'tester@dongbac.internal', role: 'operator' };
      },
      findActiveByUserId: async () => { throw new Error('service-role lookup must not run'); }
    }
  });
  await service.getAuthenticatedUser({ headers: { authorization: 'Bearer user-jwt' } }, config);
  assert.deepEqual(lookup, [config, 'user-1', 'user-jwt']);
});
