const { withDeadline } = require('../services/request-deadline');
const { randomUUID } = require('node:crypto');
function createNotificationRuleRepository({ fetchImpl = fetch, httpError }) {
  fetchImpl = withDeadline(fetchImpl);
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

  async function claimDelivery(config, ruleKey, currentIso, cooldownMinutes, inheritedSentAt = null) {
    // Initialize once; an existing failed-device row must never inherit another device's success.
    await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?on_conflict=rule_key`, {
      method: 'POST', headers: headers(config, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ rule_key: ruleKey, last_sent_at: inheritedSentAt, last_result: 'initialized' })
    }), 'Không khởi tạo được trạng thái thiết bị.');
    const previous = await find(config, ruleKey);
    const previousSentAt = previous?.last_sent_at || null;
    if (previousSentAt && Date.parse(currentIso) - Date.parse(previousSentAt) < cooldownMinutes * 60000) return null;
    const token = `sending:${randomUUID()}`;
    const query = new URLSearchParams({ rule_key: `eq.${ruleKey}`, last_sent_at: previousSentAt ? `eq.${previousSentAt}` : 'is.null' });
    const rows = await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${query}`, {
      method: 'PATCH', headers: headers(config, { Prefer: 'return=representation' }),
      body: JSON.stringify({ last_sent_at: currentIso, last_evaluated_at: currentIso, last_result: token, updated_at: currentIso })
    }), 'Không giữ được lượt gửi cảnh báo.');
    return rows.length ? { token, previousSentAt } : null;
  }

  async function finishDelivery(config, ruleKey, claim, currentIso, result, uncertain) {
    const query = new URLSearchParams({ rule_key: `eq.${ruleKey}`, last_result: `eq.${claim.token}` });
    const rows = await parse(await fetchImpl(`${config.supabaseUrl}/rest/v1/notification_rule_states?${query}`, {
      method: 'PATCH', headers: headers(config, { Prefer: 'return=representation' }),
      body: JSON.stringify({ last_result: uncertain ? 'uncertain' : result, last_sent_at: result === 'sent' || uncertain ? currentIso : claim.previousSentAt, updated_at: currentIso })
    }), 'Không lưu được kết quả gửi cảnh báo.');
    if (!rows.length) throw httpError(409, 'Lượt gửi cảnh báo không còn thuộc worker này.');
  }

  return { find, upsert, claimDelivery, finishDelivery };
}

module.exports = { createNotificationRuleRepository };
