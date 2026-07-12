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

  return { findActiveByUserId };
}

module.exports = { createAppUserRepository };
