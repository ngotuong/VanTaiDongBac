function createNotificationRuleRepository({ fetchImpl = fetch, httpError }) {
  function headers(config, extra = {}) {
    return {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async function parse(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || fallbackMessage);
    return data;
  }

  async function find(config, ruleKey) {
    const query = new URLSearchParams({ select: '*', rule_key: `eq.${ruleKey}`, limit: '1' });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${query}`, {
      headers: headers(config, { Accept: 'application/json' })
    });
    const rows = await parse(response, 'Không đọc được trạng thái cảnh báo.');
    return rows[0] || null;
  }

  async function upsert(config, row) {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?on_conflict=rule_key`, {
      method: 'POST',
      headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row)
    });
    const rows = await parse(response, 'Không lưu được trạng thái cảnh báo.');
    return rows[0] || row;
  }

  return { find, upsert };
}

module.exports = { createNotificationRuleRepository };
