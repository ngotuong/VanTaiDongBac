const assert = require('node:assert/strict');
const test = require('node:test');
const { createAccountService, ACCOUNT_ACTIONS } = require('../api/services/account-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const send = (res, status, body) => ({ status, body });
const config = {
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-secret'
};
const admin = { id: 'admin-1', username: 'admin', email: 'admin@dongbac.internal', role: 'admin' };

function create(overrides = {}) {
  return createAccountService({
    httpError,
    send,
    assertAdmin: (user) => { if (user.role !== 'admin') throw httpError(403, 'Chỉ quản trị viên được quản lý tài khoản.'); },
    randomBytes: () => Buffer.from('abcdefghijkl'),
    now: () => new Date('2026-07-12T00:00:00.000Z'),
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    appUserRepository: { list: async () => [], create: async (_, profile) => profile, update: async () => null },
    ...overrides
  });
}

test('AccountService owns exactly the five proxy-local account actions', () => {
  const service = create();
  assert.deepEqual([...ACCOUNT_ACTIONS], ['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword']);
  for (const action of ACCOUNT_ACTIONS) assert.equal(service.handles(action), true);
  assert.equal(service.handles('getDashboard'), false);
});

test('AccountService keeps own-password before admin guard and preserves method/error contracts', async () => {
  let adminChecks = 0;
  const service = create({
    assertAdmin: () => { adminChecks += 1; throw httpError(403, 'admin only'); }
  });
  await assert.rejects(
    () => service.handle('changeOwnPassword', { method: 'GET', body: {} }, {}, config, { role: 'shareholder' }),
    { status: 405, message: 'Method not allowed.' }
  );
  assert.equal(adminChecks, 0);
  await assert.rejects(
    () => service.handle('listUsers', { method: 'GET' }, {}, config, { role: 'operator' }),
    { status: 403, message: 'admin only' }
  );
  assert.equal(adminChecks, 1);
});

test('AccountService lists users with the unchanged response shape', async () => {
  const users = [{ user_id: 'one', role: 'admin' }];
  const service = create({ appUserRepository: { list: async () => users } });
  assert.deepEqual(
    await service.handle('listUsers', { method: 'GET' }, {}, config, admin),
    { status: 200, body: { ok: true, users } }
  );
});

test('AccountService creates auth user and profile with normalized values and generated password', async () => {
  const requests = [];
  let profile;
  const service = create({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ user: { id: 'new/user' } }) };
    },
    appUserRepository: {
      create: async (_, value) => { profile = value; return value; }
    }
  });
  const result = await service.handle('createUser', {
    method: 'POST', body: { username: ' New.User ', displayName: ' Người mới ', role: 'operator' }
  }, {}, config, admin);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.match(result.body.temporaryPassword, /^Db@.+9a$/);
  assert.deepEqual(profile, {
    user_id: 'new/user', username: 'new.user', email: 'new.user@dongbac.internal',
    role: 'operator', active: true, display_name: 'Người mới'
  });
  const authBody = JSON.parse(requests[0].options.body);
  assert.equal(authBody.email, 'new.user@dongbac.internal');
  assert.equal(authBody.password, result.body.temporaryPassword);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer service-secret');
});

test('AccountService deletes a newly created auth user when profile creation fails', async () => {
  const requests = [];
  const service = create({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ id: 'new/user' }) };
    },
    appUserRepository: { create: async () => { throw httpError(409, 'profile conflict'); } }
  });
  await assert.rejects(
    () => service.handle('createUser', { method: 'POST', body: { username: 'new.user', password: '123456' } }, {}, config, admin),
    { status: 409, message: 'profile conflict' }
  );
  assert.equal(requests[1].options.method, 'DELETE');
  assert.match(requests[1].url, /admin\/users\/new%2Fuser$/);
});

test('AccountService preserves update validation, self-protection, persistence, and response', async () => {
  let update;
  const service = create({
    appUserRepository: {
      update: async (_, userId, changes) => { update = { userId, changes }; return { user_id: userId, ...changes }; }
    }
  });
  await assert.rejects(
    () => service.handle('updateUser', { method: 'POST', body: { userId: admin.id, displayName: 'Admin', role: 'operator', active: true } }, {}, config, admin),
    { status: 400, message: 'Bạn không thể tự hạ quyền hoặc vô hiệu hóa tài khoản đang đăng nhập.' }
  );
  const result = await service.handle('updateUser', {
    method: 'POST', body: { userId: 'user/2', displayName: ' User Two ', role: 'shareholder', active: 'true' }
  }, {}, config, admin);
  assert.deepEqual(update, {
    userId: 'user/2',
    changes: { display_name: 'User Two', role: 'shareholder', active: true, updated_at: '2026-07-12T00:00:00.000Z' }
  });
  assert.equal(result.body.user.user_id, 'user/2');
});

test('AccountService verifies current password and updates own password with existing auth calls', async () => {
  const requests = [];
  const service = create({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({}) };
    }
  });
  const result = await service.handle('changeOwnPassword', {
    method: 'POST', body: { currentPassword: 'old-pass', newPassword: 'new-pass' }
  }, {}, config, { id: 'user/1', username: 'tester', role: 'shareholder' });
  assert.deepEqual(result, { status: 200, body: { ok: true, message: 'Đã đổi mật khẩu thành công.' } });
  assert.match(requests[0].url, /token\?grant_type=password$/);
  assert.equal(JSON.parse(requests[0].options.body).email, 'tester@dongbac.internal');
  assert.match(requests[1].url, /admin\/users\/user%2F1$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), { password: 'new-pass' });
});

test('AccountService resets password and retains six-character validation', async () => {
  const requests = [];
  const service = create({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({}) };
    }
  });
  await assert.rejects(
    () => service.handle('resetUserPassword', { method: 'POST', body: { userId: 'one', password: '12345' } }, {}, config, admin),
    { status: 400, message: 'Mật khẩu phải có ít nhất 6 ký tự.' }
  );
  const result = await service.handle('resetUserPassword', {
    method: 'POST', body: { userId: 'user/1', password: '123456' }
  }, {}, config, admin);
  assert.deepEqual(result, { status: 200, body: { ok: true, temporaryPassword: '123456' } });
  assert.match(requests[0].url, /admin\/users\/user%2F1$/);
});
