const CHANNELS = Object.freeze({
  'trip-reconciliation': { roles: ['admin', 'operator'], title: 'Đối soát chuyến' },
  'fund-low-balance': { roles: ['admin', 'shareholder'], title: 'Cảnh báo Quỹ' },
  'operations-integrity': { roles: ['admin', 'operator'], title: 'Kiểm tra vận hành' },
  'system-health': { roles: ['admin'], title: 'Hệ thống cần kiểm tra' }
});
const BASELINE_KEY = 'notification-dispatch-baseline-v1';
const { vietnamClock } = require('./vietnam-time');
const crypto = require('node:crypto');
const { assertPushEndpoint } = require('./push-endpoint-policy');

function itemEventKeys(item) {
  return [item.id, ...(Array.isArray(item.legacyIds) ? item.legacyIds : [])].map((id) => `notification-event:${id}`);
}

function notificationCenterTarget(notificationId = '') {
  const suffix = notificationId ? `&notificationId=${encodeURIComponent(notificationId)}` : '';
  return `/?notifications=open${suffix}`;
}

function createNotificationDispatchService({ centerService, fundAlertService, deliveryRepository, preferenceRepository, appUserRepository, subscriptionRepository, webPush, httpError, now = () => new Date() }) {
  function assertConfigured(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey || !config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) throw httpError(503, 'Delivery thông báo chưa được cấu hình đầy đủ.');
  }
  function localClock(currentTime) {
    return vietnamClock(currentTime);
  }
  async function recipients(config, channelKey, roles) {
    const users = (await appUserRepository.list(config)).filter((user) => user.active && roles.includes(user.role));
    const preferences = await preferenceRepository.listByUserIds(config, channelKey, users.map((user) => user.user_id));
    const disabled = new Set(preferences.filter((row) => row.enabled === false).map((row) => row.user_id));
    const userIds = users.map((user) => user.user_id).filter((id) => !disabled.has(id));
    return { userIds, subscriptions: await subscriptionRepository.listByUserIds(config, userIds) };
  }
  async function sendToSubscriptions(config, rows, payload, eventKeys = [], currentIso = now().toISOString(), events = null) {
    if (!rows.length) return { sent: 0, removed: 0, failed: 0 };
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    let sent = 0; let removed = 0; let failed = 0;
    for (const row of rows) {
      const device = crypto.createHash('sha256').update(row.endpoint).digest('hex').slice(0, 40);
      const keys = eventKeys.map((key) => `${key}:device:${device}`);
      const completed = new Set((keys.length ? await deliveryRepository.list(config, keys) : [])
        .filter((state) => ['sent', 'expired'].includes(state.last_result)).map((state) => state.rule_key));
      if (keys.length && keys.every((key) => completed.has(key))) continue;
      const pendingKeys = keys.filter((key) => !completed.has(key));
      const pendingEvents = events?.filter((_item, index) => !completed.has(keys[index]));
      const notification = pendingEvents ? immediatePayload(pendingEvents[0].notificationKey, pendingEvents) : payload;
      try {
        assertPushEndpoint(row.endpoint);
        await webPush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, JSON.stringify(notification), { TTL: 3600, urgency: 'normal', timeout: 10000 });
        sent += 1;
        if (keys.length) await deliveryRepository.upsert(config, pendingKeys.map((key) => stateRow(key, 'sent', currentIso, true)));
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await subscriptionRepository.removeById(config, row.id);
          removed += 1;
          if (keys.length) await deliveryRepository.upsert(config, pendingKeys.map((key) => stateRow(key, 'expired', currentIso, false)));
        } else failed += 1;
      }
    }
    return { sent, removed, failed };
  }
  function stateRow(key, result, currentIso, sent) {
    return { rule_key: key, condition_active: true, last_evaluated_at: currentIso, last_sent_at: sent ? currentIso : null, last_result: result, updated_at: currentIso };
  }
  async function baseline(config, items, currentIso) {
    const keys = [BASELINE_KEY, ...items.flatMap(itemEventKeys)];
    const existing = new Set((await deliveryRepository.list(config, keys)).map((row) => row.rule_key));
    if (existing.has(BASELINE_KEY)) return null;
    const rows = [stateRow(BASELINE_KEY, 'initialized', currentIso, false), ...items.filter((item) => !existing.has(`notification-event:${item.id}`)).map((item) => stateRow(`notification-event:${item.id}`, 'baseline', currentIso, false))];
    await deliveryRepository.upsert(config, rows);
    return { baselineCreated: true, baselineItems: items.length, sent: 0 };
  }
  async function sendImmediate(config, items, currentIso) {
    // Fund delivery owns its configured cooldown and per-device reservations.
    items = items.filter((item) => item.notificationKey !== 'fund-low-balance');
    const keys = items.flatMap(itemEventKeys);
    const existing = new Set((await deliveryRepository.list(config, keys)).map((row) => row.rule_key));
    const fresh = items.filter((item) => CHANNELS[item.notificationKey] && !itemEventKeys(item).some((key) => existing.has(key)));
    const migratedRows = items
      .filter((item) => !existing.has(`notification-event:${item.id}`) && itemEventKeys(item).slice(1).some((key) => existing.has(key)))
      .map((item) => stateRow(`notification-event:${item.id}`, 'migrated-stable-id', currentIso, false));
    const groups = new Map();
    for (const item of fresh) {
      if (!groups.has(item.notificationKey)) groups.set(item.notificationKey, []);
      groups.get(item.notificationKey).push(item);
    }
    const results = [];
    const stateRows = migratedRows.slice();
    for (const [channelKey, group] of groups) {
      const channel = CHANNELS[channelKey];
      const target = await recipients(config, channelKey, channel.roles);
      const delivery = await sendToSubscriptions(config, target.subscriptions, immediatePayload(channelKey, group), group.map((item) => `notification-event:${item.id}`), currentIso, group);
      const result = delivery.failed ? 'failed' : target.subscriptions.length ? 'sent' : 'no-subscriptions';
      if (result !== 'failed') {
        for (const item of group) stateRows.push(stateRow(`notification-event:${item.id}`, result, currentIso, delivery.sent > 0));
      }
      results.push({ channelKey, itemCount: group.length, recipientCount: target.userIds.length, subscriptionCount: target.subscriptions.length, ...delivery });
    }
    await deliveryRepository.upsert(config, stateRows);
    return { newItemCount: fresh.length, channels: results };
  }
  function immediatePayload(channelKey, group) {
    const first = group[0];
    const body = group.length === 1 ? first.message : channelKey === 'trip-reconciliation'
      ? `Có ${group.length} cập nhật đối soát mới. Mở ứng dụng để xem chi tiết.`
      : `Có ${group.length} cảnh báo mới. Mở ứng dụng để xem chi tiết.`;
    return { title: CHANNELS[channelKey].title, body, tag: `vtdb-${channelKey}`, url: notificationCenterTarget(group.length === 1 ? first.id : ''), notificationId: group.length === 1 ? first.id : '', badgeIds: group.map((item) => item.id), unreadDelta: group.length };
  }
  function formatNumber(value, maximumFractionDigits = 0) {
    return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits });
  }
  async function sendDigest(config, items, dailySummary, currentTime, currentIso, force) {
    const clock = localClock(currentTime);
    if (!force && clock.hour !== 12) return { skipped: true, reason: 'Daily digest is scheduled at 12:00 Asia/Ho_Chi_Minh for the previous day.' };
    const digestKey = `notification-digest:${clock.previousDateKey}`;
    const previousDeliveries = await deliveryRepository.list(config, [digestKey]);
    if (previousDeliveries.some((row) => row.last_result === 'sent' || row.last_result === 'no-subscriptions')) {
      return { skipped: true, reason: 'Daily digest was already delivered.' };
    }
    const target = await recipients(config, 'daily-digest', ['admin', 'operator', 'shareholder']);
    const summary = dailySummary?.date === clock.previousDateKey ? dailySummary : null;
    const body = summary
      ? [
          `Số chuyến: ${formatNumber(summary.trips, 2)}`,
          `Số xe: ${formatNumber(summary.vehicleCount)}`,
          `Doanh thu: ${formatNumber(summary.revenue)} đ`,
          summary.fuelAvailable ? `Chi phí dầu: ${formatNumber(summary.fuelExpense)} đ` : 'Chi phí dầu: chưa có dữ liệu',
          summary.fundAvailable ? `Chi Quỹ: ${formatNumber(summary.fundExpense)} đ` : 'Chi Quỹ: chưa có dữ liệu',
          summary.salaryAvailable ? `Chi phí lương: ${formatNumber(summary.salaryExpense)} đ` : 'Chi phí lương: chưa có dữ liệu',
          summary.grossProfitAvailable ? `Lợi nhuận gộp ước tính: ${formatNumber(summary.grossProfit)} đ` : 'Lợi nhuận gộp ước tính: chưa có dữ liệu'
        ].join('\n')
      : 'Chưa có dữ liệu tổng hợp của ngày hôm qua.';
    const delivery = await sendToSubscriptions(config, target.subscriptions, { title: `Tổng hợp ngày ${clock.previousDateKey.split('-').reverse().join('/')}`, body, tag: `vtdb-digest-${clock.previousDateKey}`, url: notificationCenterTarget(), unreadDelta: 0, preserveBadge: true }, [digestKey], currentIso);
    const deliveryResult = delivery.failed > 0 ? 'failed' : target.subscriptions.length ? 'sent' : 'no-subscriptions';
    await deliveryRepository.upsert(config, [stateRow(digestKey, deliveryResult, currentIso, delivery.failed === 0 && delivery.sent > 0)]);
    return { itemCount: items.length, recipientCount: target.userIds.length, subscriptionCount: target.subscriptions.length, ...delivery };
  }
  async function run(config, { dryRun = false, forceDigest = false } = {}) {
    assertConfigured(config);
    const currentTime = now(); const currentIso = currentTime.toISOString();
    const center = await centerService.list(config); const items = center.items || [];
    if (dryRun) {
      const counts = items.reduce((map, item) => (map[item.notificationKey] = (map[item.notificationKey] || 0) + 1, map), {});
      return { dryRun: true, count: items.length, counts, digestDue: forceDigest || localClock(currentTime).hour === 12 };
    }
    const initialized = await baseline(config, items, currentIso);
    if (initialized) return initialized;
    if (items.some((item) => item.notificationKey === 'fund-low-balance') && !fundAlertService) throw httpError(503, 'Chưa cấu hình bộ gửi cảnh báo Quỹ.');
    return { immediate: await sendImmediate(config, items, currentIso), fund: await fundAlertService?.dispatch(config), digest: await sendDigest(config, items, center.dailySummary, currentTime, currentIso, forceDigest) };
  }
  return { run, localClock };
}

module.exports = { createNotificationDispatchService, CHANNELS, BASELINE_KEY, notificationCenterTarget };
