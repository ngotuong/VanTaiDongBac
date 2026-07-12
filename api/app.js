const crypto = require('crypto');
const { createAppsScriptClient } = require('./services/apps-script-client');
const { createAuthorizationPolicy } = require('./services/authorization-policy');

const INTERNAL_EMAIL_DOMAIN = 'dongbac.internal';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;
const ROLES = new Set(['admin', 'operator', 'shareholder']);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function internalEmail(username) {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

function generateTemporaryPassword() {
  return `Db@${crypto.randomBytes(12).toString('base64url')}9a`;
}

function serviceHeaders(config, extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
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

async function getAuthenticatedUser(req, config) {
  const token = bearerToken(req);
  if (!token) throw httpError(401, 'Vui lòng đăng nhập để tiếp tục.');
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const authUser = await response.json();

  const allowlistResponse = await fetch(
    `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,email,role,active,display_name&user_id=eq.${encodeURIComponent(authUser.id)}&active=eq.true&limit=1`,
    { headers: serviceHeaders(config) }
  );
  const rows = await parseJsonResponse(allowlistResponse, 'Không kiểm tra được danh sách người dùng nội bộ.');
  if (!rows.length) throw httpError(403, 'Tài khoản này chưa được cấp quyền sử dụng hệ thống.');
  return {
    id: authUser.id,
    username: rows[0].username,
    email: rows[0].email,
    role: rows[0].role,
    displayName: rows[0].display_name || rows[0].username
  };
}

const { assertAuthorized, assertAdmin } = createAuthorizationPolicy({ httpError });

async function listUsers(config) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,display_name,role,active,created_at&order=created_at.asc`,
    { headers: serviceHeaders(config) }
  );
  return parseJsonResponse(response, 'Không tải được danh sách tài khoản.');
}

async function createUser(config, body) {
  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || '').trim() || username;
  const role = String(body.role || 'shareholder').trim();
  const password = String(body.password || '') || generateTemporaryPassword();
  if (!USERNAME_PATTERN.test(username)) throw httpError(400, 'Tên đăng nhập phải dài 3–40 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  if (!ROLES.has(role)) throw httpError(400, 'Vai trò không hợp lệ.');
  if (password.length < 6) throw httpError(400, 'Mật khẩu phải có ít nhất 6 ký tự.');

  const authResponse = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
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
    const profileResponse = await fetch(`${config.supabaseUrl}/rest/v1/app_users`, {
      method: 'POST',
      headers: serviceHeaders(config, { Prefer: 'return=representation' }),
      body: JSON.stringify({
        user_id: authUser.id,
        username,
        email: internalEmail(username),
        role,
        active: true,
        display_name: displayName
      })
    });
    const rows = await parseJsonResponse(profileResponse, 'Không tạo được hồ sơ phân quyền.');
    return { user: rows[0], temporaryPassword: password };
  } catch (err) {
    await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
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
  const response = await fetch(`${config.supabaseUrl}/rest/v1/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: serviceHeaders(config, { Prefer: 'return=representation' }),
    body: JSON.stringify({ display_name: displayName, role, active, updated_at: new Date().toISOString() })
  });
  const rows = await parseJsonResponse(response, 'Không cập nhật được tài khoản.');
  if (!rows.length) throw httpError(404, 'Không tìm thấy tài khoản.');
  return rows[0];
}

async function updateAuthPassword(config, userId, password) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
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
  const verifyResponse = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
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

async function handleAccountAction(action, req, res, config, user) {
  const body = req.body || {};
  if (action === 'changeOwnPassword') {
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    await changeOwnPassword(config, user, body);
    return send(res, 200, { ok: true, message: 'Đã đổi mật khẩu thành công.' });
  }
  assertAdmin(user);
  if (action === 'listUsers') {
    if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
    return send(res, 200, { ok: true, users: await listUsers(config) });
  }
  if (action === 'createUser') {
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    const result = await createUser(config, body);
    return send(res, 200, { ok: true, ...result });
  }
  if (action === 'updateUser') {
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    return send(res, 200, { ok: true, user: await updateUser(config, user, body) });
  }
  if (action === 'resetUserPassword') {
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    const temporaryPassword = await resetUserPassword(config, body);
    return send(res, 200, { ok: true, temporaryPassword });
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  const config = {
    supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: String(process.env.SUPABASE_ANON_KEY || ''),
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
    appsScriptUrl: String(process.env.APPS_SCRIPT_URL || ''),
    proxySecret: String(process.env.APP_PROXY_SECRET || '')
  };
  if (Object.values(config).some((value) => !value)) return send(res, 503, { ok: false, error: 'API proxy chưa được cấu hình đầy đủ.' });

  const action = String(req.query?.action || req.body?.action || '').trim();
  if (!action) return send(res, 400, { ok: false, error: 'Thiếu action.' });
  try {
    let user = null;
    if (action !== 'health') user = await getAuthenticatedUser(req, config);
    if (action === 'authSession') return send(res, 200, { ok: true, user });
    assertAuthorized(user, action);
    if (['changeOwnPassword', 'listUsers', 'createUser', 'updateUser', 'resetUserPassword'].includes(action)) {
      return handleAccountAction(action, req, res, config, user);
    }

    const params = req.method === 'GET' ? { ...req.query } : { ...(req.body?.params || {}) };
    delete params.action;
    const body = req.method === 'POST' ? { ...(req.body || {}) } : {};
    delete body.action;
    delete body.params;
    const client = createAppsScriptClient();
    const result = await client.forward({
      url: config.appsScriptUrl,
      action,
      method: req.method,
      params,
      body,
      proxySecret: config.proxySecret,
      requestUser: user
    });
    return send(res, result.status, result.body);
  } catch (err) {
    return send(res, err.status || 500, { ok: false, error: err.message || 'Lỗi API proxy.' });
  }
};
