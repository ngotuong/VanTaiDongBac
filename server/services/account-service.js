const crypto = require('crypto');

const INTERNAL_EMAIL_DOMAIN = 'dongbac.internal';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;
const ROLES = new Set(['admin', 'operator', 'shareholder']);
const ACCOUNT_ACTIONS = new Set(['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword']);

function createAccountService({
  fetchImpl = fetch,
  randomBytes = crypto.randomBytes,
  now = () => new Date(),
  appUserRepository,
  assertAdmin,
  httpError,
  send
}) {
  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function internalEmail(username) {
    return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
  }

  function generateTemporaryPassword() {
    return `Db@${randomBytes(12).toString('base64url')}9a`;
  }

  function serviceHeaders(config) {
    return {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function parseJsonResponse(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.msg || data.message || data.error_description || data.error || fallbackMessage;
      throw httpError(response.status >= 400 && response.status < 500 ? response.status : 500, message);
    }
    return data;
  }

  async function createUser(config, body) {
    const username = normalizeUsername(body.username);
    const displayName = String(body.displayName || '').trim() || username;
    const role = String(body.role || 'shareholder').trim();
    const password = String(body.password || '') || generateTemporaryPassword();
    if (!USERNAME_PATTERN.test(username)) throw httpError(400, 'Tên đăng nhập phải dài 3–40 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    if (!ROLES.has(role)) throw httpError(400, 'Vai trò không hợp lệ.');
    if (password.length < 6) throw httpError(400, 'Mật khẩu phải có ít nhất 6 ký tự.');

    const authResponse = await fetchImpl(`${config.supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders(config),
      body: JSON.stringify({
        email: internalEmail(username),
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName }
      })
    });
    const authResult = await parseJsonResponse(authResponse, 'Không tạo được tài khoản đăng nhập.');
    const authUser = authResult.user || authResult;
    if (!authUser.id) throw httpError(500, 'Supabase không trả về mã tài khoản vừa tạo.');
    try {
      const user = await appUserRepository.create(config, {
        user_id: authUser.id,
        username,
        email: internalEmail(username),
        role,
        active: true,
        display_name: displayName
      });
      return { user, temporaryPassword: password };
    } catch (err) {
      await fetchImpl(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
        method: 'DELETE', headers: serviceHeaders(config)
      }).catch(() => null);
      throw err;
    }
  }

  async function updateUser(config, currentUser, body) {
    const userId = String(body.userId || '').trim();
    const displayName = String(body.displayName || '').trim();
    const role = String(body.role || '').trim();
    const active = body.active === true || body.active === 'true';
    if (!userId || !displayName) throw httpError(400, 'Thiếu thông tin tài khoản.');
    if (!ROLES.has(role)) throw httpError(400, 'Vai trò không hợp lệ.');
    if (userId === currentUser.id && (role !== 'admin' || !active)) {
      throw httpError(400, 'Bạn không thể tự hạ quyền hoặc vô hiệu hóa tài khoản đang đăng nhập.');
    }
    const user = await appUserRepository.update(config, userId, {
      display_name: displayName,
      role,
      active,
      updated_at: now().toISOString()
    });
    if (!user) throw httpError(404, 'Không tìm thấy tài khoản.');
    return user;
  }

  async function updateAuthPassword(config, userId, password) {
    const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: serviceHeaders(config),
      body: JSON.stringify({ password })
    });
    return parseJsonResponse(response, 'Không đổi được mật khẩu.');
  }

  async function changeOwnPassword(config, user, body) {
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword) throw httpError(400, 'Vui lòng nhập mật khẩu hiện tại.');
    if (newPassword.length < 6) throw httpError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    if (currentPassword === newPassword) throw httpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    const verifyResponse = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email || internalEmail(user.username), password: currentPassword })
    });
    if (!verifyResponse.ok) throw httpError(400, 'Mật khẩu hiện tại không đúng.');
    await updateAuthPassword(config, user.id, newPassword);
  }

  async function resetUserPassword(config, body) {
    const userId = String(body.userId || '').trim();
    const password = String(body.password || '') || generateTemporaryPassword();
    if (!userId) throw httpError(400, 'Thiếu tài khoản cần đặt lại mật khẩu.');
    if (password.length < 6) throw httpError(400, 'Mật khẩu phải có ít nhất 6 ký tự.');
    await updateAuthPassword(config, userId, password);
    return password;
  }

  function handles(action) {
    return ACCOUNT_ACTIONS.has(action);
  }

  async function handle(action, req, res, config, user) {
    const body = req.body || {};
    if (action === 'changeOwnPassword') {
      if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
      await changeOwnPassword(config, user, body);
      return send(res, 200, { ok: true, message: 'Đã đổi mật khẩu thành công.' });
    }
    assertAdmin(user);
    if (action === 'listUsers') {
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
      return send(res, 200, { ok: true, users: await appUserRepository.list(config) });
    }
    if (action === 'createUser') {
      if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
      return send(res, 200, { ok: true, ...await createUser(config, body) });
    }
    if (action === 'updateUser') {
      if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
      return send(res, 200, { ok: true, user: await updateUser(config, user, body) });
    }
    if (action === 'resetUserPassword') {
      if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
      return send(res, 200, { ok: true, temporaryPassword: await resetUserPassword(config, body) });
    }
    return null;
  }

  return { handles, handle };
}

module.exports = { createAccountService, ACCOUNT_ACTIONS };
