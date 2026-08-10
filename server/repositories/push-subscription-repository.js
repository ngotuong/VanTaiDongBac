const crypto = require('crypto');

function hashEndpoint(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || ''), 'utf8').digest('hex');
}

function createPushSubscriptionRepository({ fetchImpl = fetch, httpError }) {
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
    if (!response.ok) {
      const message = data.message || data.error_description || data.error || fallbackMessage;
      throw httpError(response.status >= 400 && response.status < 500 ? response.status : 502, message);
    }
    return data;
  }

  async function listByUser(config, userId) {
    const query = new URLSearchParams({
      select: 'id,user_id,endpoint_hash,endpoint,p256dh,auth_secret,created_at,updated_at,last_seen_at',
      user_id: `eq.${userId}`,
      order: 'updated_at.desc'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/web_push_subscriptions?${query}`, {
      headers: headers(config, { Accept: 'application/json' })
    });
    return parse(response, 'Không đọc được đăng ký thông báo của tài khoản.');
  }

  async function findByUserAndEndpoint(config, userId, endpoint) {
    const query = new URLSearchParams({
      select: 'id,user_id,endpoint_hash,endpoint,p256dh,auth_secret',
      user_id: `eq.${userId}`,
      endpoint_hash: `eq.${hashEndpoint(endpoint)}`,
      limit: '1'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/web_push_subscriptions?${query}`, {
      headers: headers(config, { Accept: 'application/json' })
    });
    const rows = await parse(response, 'Không đọc được thiết bị nhận thông báo.');
    return rows[0] || null;
  }

  async function listByUserIds(config, userIds) {
    const ids = [...new Set((userIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const encodedIds = ids.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',');
    const query = new URLSearchParams({
      select: 'id,user_id,endpoint,p256dh,auth_secret',
      user_id: `in.(${encodedIds})`,
      order: 'created_at.asc'
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/web_push_subscriptions?${query}`, {
      headers: headers(config, { Accept: 'application/json' })
    });
    return parse(response, 'Không đọc được danh sách thiết bị nhận cảnh báo.');
  }

  async function upsert(config, userId, subscription, userAgent, nowIso) {
    const row = {
      user_id: userId,
      endpoint_hash: hashEndpoint(subscription.endpoint),
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_secret: subscription.keys.auth,
      user_agent: String(userAgent || '').slice(0, 500),
      updated_at: nowIso,
      last_seen_at: nowIso
    };
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/web_push_subscriptions?on_conflict=user_id,endpoint_hash`,
      {
        method: 'POST',
        headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify(row)
      }
    );
    const rows = await parse(response, 'Không lưu được thiết bị nhận thông báo.');
    return rows[0] || row;
  }

  async function remove(config, userId, endpoint) {
    const query = new URLSearchParams({
      user_id: `eq.${userId}`,
      endpoint_hash: `eq.${hashEndpoint(endpoint)}`
    });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/web_push_subscriptions?${query}`, {
      method: 'DELETE',
      headers: headers(config, { Prefer: 'return=minimal' })
    });
    await parse(response, 'Không hủy được thiết bị nhận thông báo.');
    return true;
  }

  async function removeById(config, id) {
    const query = new URLSearchParams({ id: `eq.${String(id || '').trim()}` });
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/web_push_subscriptions?${query}`, {
      method: 'DELETE',
      headers: headers(config, { Prefer: 'return=minimal' })
    });
    await parse(response, 'Không xóa được đăng ký thông báo hết hạn.');
    return true;
  }

  return { listByUser, findByUserAndEndpoint, listByUserIds, upsert, remove, removeById };
}

module.exports = { createPushSubscriptionRepository, hashEndpoint };
