function createNotificationPreferenceRepository({ fetchImpl = fetch, httpError }) {
  const headers = (config, extra = {}) => ({ apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', ...extra });
  async function parse(response, message) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || message);
    return data;
  }
  async function listByUser(config, userId) {
    const query = new URLSearchParams({ select: 'notification_key,enabled,updated_at', user_id: `eq.${userId}` });
    const stateQuery = new URLSearchParams({ select: 'rule_key,condition_active,updated_at', rule_key: `like.notification-preference:${userId}:*` });
    const [rows, states] = await Promise.all([
      parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?${query}`, { headers: headers(config) }), 'Không đọc được lựa chọn thông báo.'),
      parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${stateQuery}`, { headers: headers(config) }), 'Không đọc được lựa chọn thông báo mở rộng.')
    ]);
    return [...rows, ...states.map((row) => ({ notification_key: String(row.rule_key).split(':').slice(2).join(':'), enabled: Boolean(row.condition_active), updated_at: row.updated_at }))];
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
    if (notificationKey !== 'fund-low-balance') {
      const query = new URLSearchParams({ select: 'rule_key,condition_active', rule_key: `like.notification-preference:*:${notificationKey}` });
      const rows = await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${query}`, { headers: headers(config) }), 'Không đọc được lựa chọn của người nhận.');
      const allowed = new Set(userIds.map(String));
      return rows.map((row) => ({ user_id: String(row.rule_key).split(':')[1], notification_key: notificationKey, enabled: Boolean(row.condition_active) })).filter((row) => allowed.has(row.user_id));
    }
    const ids = userIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    const query = new URLSearchParams({ select: 'user_id,notification_key,enabled', notification_key: `eq.${notificationKey}`, user_id: `in.(${ids})` });
    return parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_preferences?${query}`, { headers: headers(config) }), 'Không đọc được lựa chọn của người nhận.');
  }
  async function upsert(config, userId, notificationKey, enabled, nowIso) {
    if (notificationKey !== 'fund-low-balance') {
      const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?on_conflict=rule_key`, {
        method: 'POST', headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ rule_key: `notification-preference:${userId}:${notificationKey}`, condition_active: enabled, last_evaluated_at: nowIso, last_result: 'preference', updated_at: nowIso })
      });
      await parse(response, 'Không lưu được lựa chọn thông báo.');
      return { user_id: userId, notification_key: notificationKey, enabled };
    }
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
