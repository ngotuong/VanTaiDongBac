const CHANNELS = Object.freeze({
  'trip-reconciliation': { roles: ['admin', 'operator'], title: 'Đối soát chuyến', url: '/manage/?entry=vanChuyen' },
  'fund-low-balance': { roles: ['admin', 'shareholder'], title: 'Cảnh báo Quỹ', url: '/cashflow/' },
  'operations-integrity': { roles: ['admin', 'operator'], title: 'Kiểm tra vận hành', url: '/manage/' },
  'system-health': { roles: ['admin'], title: 'Hệ thống cần kiểm tra', url: '/observability/' }
});
const BASELINE_KEY = 'notification-dispatch-baseline-v1';

function createNotificationDispatchService({ centerService, deliveryRepository, preferenceRepository, appUserRepository, subscriptionRepository, webPush, httpError, now = () => new Date() }) {
  function assertConfigured(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey || !config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) throw httpError(503, 'Delivery thông báo chưa được cấu hình đầy đủ.');
  }
  function localClock(currentTime) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(currentTime);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { dateKey: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
  }
  async function recipients(config, channelKey, roles) {
    const users = (await appUserRepository.list(config)).filter((user) => user.active && roles.includes(user.role));
    const preferences = await preferenceRepository.listByUserIds(config, channelKey, users.map((user) => user.user_id));
    const disabled = new Set(preferences.filter((row) => row.enabled === false).map((row) => row.user_id));
    const userIds = users.map((user) => user.user_id).filter((id) => !disabled.has(id));
    return { userIds, subscriptions: await subscriptionRepository.listByUserIds(config, userIds) };
  }
  async function sendToSubscriptions(config, rows, payload) {
    if (!rows.length) return { sent: 0, removed: 0, failed: 0 };
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    let sent = 0; let removed = 0; let failed = 0;
    for (const row of rows) {
      try {
        await webPush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
        sent += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await subscriptionRepository.removeById(config, row.id);
          removed += 1;
        } else failed += 1;
      }
    }
    return { sent, removed, failed };
  }
  function stateRow(key, result, currentIso, sent) {
    return { rule_key: key, condition_active: true, last_evaluated_at: currentIso, last_sent_at: sent ? currentIso : null, last_result: result, updated_at: currentIso };
  }
  async function baseline(config, items, currentIso) {
    const keys = [BASELINE_KEY, ...items.map((item) => `notification-event:${item.id}`)];
    const existing = new Set((await deliveryRepository.list(config, keys)).map((row) => row.rule_key));
    if (existing.has(BASELINE_KEY)) return null;
    const rows = [stateRow(BASELINE_KEY, 'initialized', currentIso, false), ...items.filter((item) => !existing.has(`notification-event:${item.id}`)).map((item) => stateRow(`notification-event:${item.id}`, 'baseline', currentIso, false))];
    await deliveryRepository.upsert(config, rows);
    return { baselineCreated: true, baselineItems: items.length, sent: 0 };
  }
  async function sendImmediate(config, items, currentIso) {
    const keys = items.map((item) => `notification-event:${item.id}`);
    const existing = new Set((await deliveryRepository.list(config, keys)).map((row) => row.rule_key));
    const fresh = items.filter((item) => CHANNELS[item.notificationKey] && !existing.has(`notification-event:${item.id}`));
    const groups = new Map();
    for (const item of fresh) {
      if (!groups.has(item.notificationKey)) groups.set(item.notificationKey, []);
      groups.get(item.notificationKey).push(item);
    }
    const results = [];
    const stateRows = [];
    for (const [channelKey, group] of groups) {
      const channel = CHANNELS[channelKey];
      const target = await recipients(config, channelKey, channel.roles);
      const first = group[0];
      const body = group.length === 1 ? first.message : `Có ${group.length} cảnh báo mới. Mở ứng dụng để xem chi tiết.`;
      const delivery = await sendToSubscriptions(config, target.subscriptions, {
        title: channel.title, body, tag: `vtdb-${channelKey}`, url: first.url || channel.url,
        unreadCount: items.length, badgeCount: items.length
      });
      const result = delivery.sent ? 'sent' : target.subscriptions.length ? 'failed' : 'no-subscriptions';
      if (result !== 'failed') {
        for (const item of group) stateRows.push(stateRow(`notification-event:${item.id}`, result, currentIso, delivery.sent > 0));
      }
      results.push({ channelKey, itemCount: group.length, recipientCount: target.userIds.length, subscriptionCount: target.subscriptions.length, ...delivery });
    }
    await deliveryRepository.upsert(config, stateRows);
    return { newItemCount: fresh.length, channels: results };
  }
  async function sendDigest(config, items, currentTime, currentIso, force) {
    const clock = localClock(currentTime);
    if (!force && clock.hour !== 20) return { skipped: true, reason: 'Daily digest is scheduled at 20:00 Asia/Ho_Chi_Minh.' };
    const digestKey = `notification-digest:${clock.dateKey}`;
    if ((await deliveryRepository.list(config, [digestKey])).length) return { skipped: true, reason: 'Daily digest was already evaluated.' };
    const target = await recipients(config, 'daily-digest', ['admin', 'operator', 'shareholder']);
    const counts = items.reduce((map, item) => (map[item.notificationKey] = (map[item.notificationKey] || 0) + 1, map), {});
    const body = items.length
      ? `${items.length} việc đang cần theo dõi: ${counts['trip-reconciliation'] || 0} chuyến, ${counts['operations-integrity'] || 0} vận hành, ${counts['fund-low-balance'] || 0} quỹ, ${counts['system-health'] || 0} hệ thống.`
      : 'Hôm nay không còn cảnh báo đang hoạt động.';
    const delivery = await sendToSubscriptions(config, target.subscriptions, { title: 'Tổng hợp cuối ngày', body, tag: `vtdb-digest-${clock.dateKey}`, url: '/', unreadCount: items.length, badgeCount: items.length });
    await deliveryRepository.upsert(config, [stateRow(digestKey, delivery.sent ? 'sent' : target.subscriptions.length ? 'failed' : 'no-subscriptions', currentIso, delivery.sent > 0)]);
    return { itemCount: items.length, recipientCount: target.userIds.length, subscriptionCount: target.subscriptions.length, ...delivery };
  }
  async function run(config, { dryRun = false, forceDigest = false } = {}) {
    assertConfigured(config);
    const currentTime = now(); const currentIso = currentTime.toISOString();
    const center = await centerService.list(config); const items = center.items || [];
    if (dryRun) {
      const counts = items.reduce((map, item) => (map[item.notificationKey] = (map[item.notificationKey] || 0) + 1, map), {});
      return { dryRun: true, count: items.length, counts, digestDue: forceDigest || localClock(currentTime).hour === 20 };
    }
    const initialized = await baseline(config, items, currentIso);
    if (initialized) return initialized;
    return { immediate: await sendImmediate(config, items, currentIso), digest: await sendDigest(config, items, currentTime, currentIso, forceDigest) };
  }
  return { run, localClock };
}

module.exports = { createNotificationDispatchService, CHANNELS, BASELINE_KEY };
