const MAX_BODY_BYTES = 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function getAuthenticatedUser(req, config) {
  const token = bearerToken(req);
  if (!token) throw Object.assign(new Error('Vui lòng đăng nhập để tiếp tục.'), { status: 401 });
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw Object.assign(new Error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'), { status: 401 });
  const user = await response.json();
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('Tài khoản không có định danh hợp lệ.'), { status: 403 });

  const allowlistResponse = await fetch(
    `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,email,role,active,display_name&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`,
    { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` } }
  );
  if (!allowlistResponse.ok) throw new Error('Không kiểm tra được danh sách người dùng nội bộ.');
  const rows = await allowlistResponse.json();
  if (!rows.length) throw Object.assign(new Error('Tài khoản này chưa được cấp quyền sử dụng hệ thống.'), { status: 403 });
  return {
    id: user.id,
    username: rows[0].username,
    role: rows[0].role,
    displayName: rows[0].display_name || rows[0].username
  };
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
    const params = req.method === 'GET' ? { ...req.query } : { ...(req.body?.params || {}) };
    delete params.action;
    const body = req.method === 'POST' ? { ...(req.body || {}) } : {};
    delete body.action;
    delete body.params;
    const payload = JSON.stringify({
      action,
      method: req.method,
      params,
      body,
      proxySecret: config.proxySecret,
      requestUser: user
    });
    if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) return send(res, 413, { ok: false, error: 'Payload quá lớn.' });
    const upstream = await fetch(config.appsScriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload
    });
    const text = await upstream.text();
    if (!upstream.ok) return send(res, 502, { ok: false, error: `Apps Script trả status ${upstream.status}.` });
    let data;
    try { data = JSON.parse(text); } catch (err) { return send(res, 502, { ok: false, error: 'Apps Script trả dữ liệu không hợp lệ.' }); }
    return send(res, data && data.ok === false ? 400 : 200, data);
  } catch (err) {
    return send(res, err.status || 500, { ok: false, error: err.message || 'Lỗi API proxy.' });
  }
};
