function createNotificationPreferenceRepository({ fetchImpl = fetch, httpError }) {
  const headers = (config, extra = {}) => ({ apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', ...extra });
  async function parse(response, message) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || message);
    return data;
  }
  async function listByUser(config, userId) {
    const query = new URLSearchParams({ select: 'notification_key,enabled,updated_at', user_id: `eq.${userId}` });
    return parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?${query}`, { headers: headers(config) }), 'Không đọc được lựa chọn thông báo.');
  }
  async function listEnabledUserIds(config, notificationKey, userIds) {
    if (!userIds.length) return [];
    const ids = userIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    const query = new URLSearchParams({ select: 'user_id', notification_key: `eq.${notificationKey}`, enabled: 'eq.true', user_id: `in.(${ids})` });
    const rows = await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?${query}`, { headers: headers(config) }), 'Không đọc được người nhận thông báo.');
    return rows.map((row) => row.user_id);
  }
  async function listByUserIds(config, notificationKey, userIds) {
    if (!userIds.length) return [];
    const ids = userIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    const query = new URLSearchParams({ select: 'user_id,notification_key,enabled', notification_key: `eq.${notificationKey}`, user_id: `in.(${ids})` });
    return parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?${query}`, { headers: headers(config) }), 'Không đọc được lựa chọn của người nhận.');
  }
  async function upsert(config, userId, notificationKey, enabled, nowIso) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?on_conflict=user_id,notification_key`, {
      method: 'POST', headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ user_id: userId, notification_key: notificationKey, enabled, updated_at: nowIso })
    });
    const rows = await parse(response, 'Không lưu được lựa chọn thông báo.');
    return rows[0] || null;
  }
  return { listByUser, listByUserIds, listEnabledUserIds, upsert };
}
module.exports = { createNotificationPreferenceRepository };
