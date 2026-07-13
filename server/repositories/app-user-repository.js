function createAppUserRepository({ fetchImpl = fetch, httpError }) {
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

  async function findActiveByUserId(config, userId) {
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,email,role,active,display_name&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`,
      { headers: serviceHeaders(config) }
    );
    const rows = await parseJsonResponse(response, 'Không kiểm tra được danh sách người dùng nội bộ.');
    return rows[0] || null;
  }

  async function findActiveByUserIdWithToken(config, userId, accessToken) {
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,email,role,active,display_name&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    const rows = await parseJsonResponse(response, 'Không kiểm tra được hồ sơ người dùng hiện tại.');
    return rows[0] || null;
  }

  async function list(config) {
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/app_users?select=user_id,username,display_name,role,active,created_at&order=created_at.asc`,
      { headers: serviceHeaders(config) }
    );
    return parseJsonResponse(response, 'Không tải được danh sách tài khoản.');
  }

  async function create(config, profile) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/app_users`, {
      method: 'POST',
      headers: serviceHeaders(config, { Prefer: 'return=representation' }),
      body: JSON.stringify(profile)
    });
    const rows = await parseJsonResponse(response, 'Không tạo được hồ sơ phân quyền.');
    return rows[0] || null;
  }

  async function update(config, userId, changes) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: serviceHeaders(config, { Prefer: 'return=representation' }),
      body: JSON.stringify(changes)
    });
    const rows = await parseJsonResponse(response, 'Không cập nhật được tài khoản.');
    return rows[0] || null;
  }

  return { findActiveByUserId, findActiveByUserIdWithToken, list, create, update };
}

module.exports = { createAppUserRepository };
