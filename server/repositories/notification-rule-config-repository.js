function createNotificationRuleConfigRepository({ fetchImpl = fetch, httpError }) {
  const headers = (config, extra = {}) => ({ apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', ...extra });
  async function parse(response, message) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || message);
    return data;
  }
  async function find(config, ruleKey) {
    const query = new URLSearchParams({ select: 'rule_key,enabled,threshold_value,cooldown_minutes,recipient_roles,notification_body,schedule_time,updated_at', rule_key: `eq.${ruleKey}`, limit: '1' });
    const rows = await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_configs?${query}`, { headers: headers(config) }), 'Không đọc được cấu hình cảnh báo.');
    return rows[0] || null;
  }
  async function update(config, ruleKey, patch, userId, nowIso) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_configs?rule_key=eq.${encodeURIComponent(ruleKey)}`, {
      method: 'PATCH', headers: headers(config, { Prefer: 'return=representation' }), body: JSON.stringify({ ...patch, updated_by: userId, updated_at: nowIso })
    });
    const rows = await parse(response, 'Không lưu được cấu hình cảnh báo.');
    if (!rows[0]) throw httpError(404, 'Không tìm thấy cấu hình cảnh báo.');
    return rows[0];
  }
  return { find, update };
}
module.exports = { createNotificationRuleConfigRepository };
