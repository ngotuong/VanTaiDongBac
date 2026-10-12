const { withDeadline } = require('../services/request-deadline');
function createNotificationDeliveryRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
  function headers(config, extra = {}) {
    return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', ...extra };
  }
  async function parse(response, message) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, data.message || data.error || message);
    return data;
  }
  async function list(config, keys) {
    const values = [...new Set((keys || []).filter(Boolean))];
    if (!values.length) return [];
    const results = [];
    for (let index = 0; index < values.length; index += 40) {
      const encoded = values.slice(index, index + 40).map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
      const query = new URLSearchParams({ select: 'rule_key,last_result,last_evaluated_at,last_sent_at', rule_key: `in.(${encoded})` });
      results.push(...await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${query}`, { headers: headers(config) }), 'Không đọc được trạng thái gửi thông báo.'));
    }
    return results;
  }
  async function upsert(config, rows) {
    if (!rows.length) return [];
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?on_conflict=rule_key`, {
      method: 'POST', headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows)
    });
    await parse(response, 'Không lưu được trạng thái gửi thông báo.');
    return rows;
  }
  return { list, upsert };
}

module.exports = { createNotificationDeliveryRepository };
