const RULE_KEY = 'fund-current-balance-below-10m';
const PREFERENCE_KEY = 'fund-low-balance';
const THRESHOLD = 10_000_000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ELIGIBLE_ROLES = new Set(['admin', 'shareholder']);
const NOTIFICATION = Object.freeze({ title: 'Vận tải Đông Bắc', body: 'Số dư quỹ đã xuống dưới ngưỡng 10 triệu', tag: RULE_KEY, url: '/cashflow/' });

function vietnamDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return { year: value('year'), monthKey: `${value('year')}-${value('month')}`, dateKey: `${value('year')}-${value('month')}-${value('day')}` };
}

function createFundLowBalanceAlertService({ balanceRepository, ruleRepository, ruleConfigRepository, preferenceRepository, appUserRepository, subscriptionRepository, webPush, httpError, now = () => new Date() }) {
  function assertConfigured(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey || !config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) throw httpError(503, 'Cảnh báo số dư Quỹ chưa được cấu hình đầy đủ.');
  }
  async function loadRule(config, override) {
    const row = override || (ruleConfigRepository ? await ruleConfigRepository.find(config, RULE_KEY) : null);
    return row || { rule_key: RULE_KEY, enabled: false, threshold_value: THRESHOLD, cooldown_minutes: COOLDOWN_MS / 60000, recipient_roles: [...ELIGIBLE_ROLES], notification_body: NOTIFICATION.body, schedule_time: '08:00' };
  }
  async function inspect(config, override) {
    assertConfigured(config);
    const rule = await loadRule(config, override);
    const currentTime = now();
    const clock = vietnamDateParts(currentTime);
    const year = /^20\d{2}$/.test(config.defaultWorkbookYear) ? config.defaultWorkbookYear : clock.year;
    const balance = await balanceRepository.currentBalance(config, year, clock.monthKey);
    const state = await ruleRepository.find(config, RULE_KEY);
    const roleSet = new Set(rule.recipient_roles || []);
    const eligibleUsers = (await appUserRepository.list(config)).filter((user) => user.active && roleSet.has(user.role));
    let users = eligibleUsers;
    if (preferenceRepository && eligibleUsers.length) {
      const storedRows = await preferenceRepository.listByUserIds(config, PREFERENCE_KEY, eligibleUsers.map((user) => user.user_id));
      const stored = new Map(storedRows.map((row) => [row.user_id, Boolean(row.enabled)]));
      users = eligibleUsers.filter((user) => stored.get(user.user_id) ?? true);
    }
    const subscriptions = await subscriptionRepository.listByUserIds(config, users.map((user) => user.user_id));
    const lastSentAt = state?.last_sent_at ? new Date(state.last_sent_at) : null;
    const cooldownMs = Number(rule.cooldown_minutes) * 60 * 1000;
    const cooldownElapsed = !lastSentAt || currentTime.getTime() - lastSentAt.getTime() >= cooldownMs;
    const threshold = Number(rule.threshold_value);
    const underThreshold = balance.value < threshold;
    return { ruleKey: RULE_KEY, ruleEnabled: Boolean(rule.enabled), threshold, cooldownHours: Number(rule.cooldown_minutes) / 60, recipientRoles: rule.recipient_roles, notificationBody: rule.notification_body, balance: balance.value, balanceSyncedAt: balance.syncedAt, balanceMonthKey: balance.monthKey, evaluatedAt: currentTime.toISOString(), dateKey: clock.dateKey, underThreshold, wouldSend: underThreshold && (!state?.condition_active || cooldownElapsed), lastSentAt: state?.last_sent_at || null, eligibleUserCount: users.length, subscriptionCount: subscriptions.length, users, subscriptions, state };
  }
  async function saveState(config, inspection, patch) {
    return ruleRepository.upsert(config, { rule_key: RULE_KEY, condition_active: inspection.underThreshold, last_value: inspection.balance, threshold_value: inspection.threshold, last_evaluated_at: inspection.evaluatedAt, last_result: patch.lastResult, ...(patch.lastSentAt ? { last_sent_at: patch.lastSentAt } : {}), updated_at: inspection.evaluatedAt });
  }
  function publicResult(inspection, extra = {}) { const { users, subscriptions, state, ...safe } = inspection; return { ...safe, ...extra }; }
  async function dryRun(config, override) { return publicResult(await inspect(config, override), { dryRun: true, sent: 0, failed: 0 }); }
  async function run(config) {
    if (!config.fundLowBalanceAlertEnabled) throw httpError(503, 'Lịch cảnh báo số dư Quỹ chưa được kích hoạt.');
    const inspection = await inspect(config);
    if (!inspection.ruleEnabled) throw httpError(503, 'Quy tắc cảnh báo số dư Quỹ đang tắt.');
    if (!inspection.underThreshold) { await saveState(config, inspection, { lastResult: 'recovered_or_safe' }); return publicResult(inspection, { dryRun: false, sent: 0, failed: 0, skipped: 'balance_not_below_threshold' }); }
    if (!inspection.wouldSend) { await saveState(config, inspection, { lastResult: 'cooldown' }); return publicResult(inspection, { dryRun: false, sent: 0, failed: 0, skipped: 'cooldown' }); }
    if (!inspection.subscriptions.length) { await saveState(config, inspection, { lastResult: 'no_subscriptions' }); return publicResult(inspection, { dryRun: false, sent: 0, failed: 0, skipped: 'no_subscriptions' }); }
    const notification = { ...NOTIFICATION, body: inspection.notificationBody };
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    let sent = 0; let failed = 0;
    for (const row of inspection.subscriptions) {
      try { await webPush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, JSON.stringify(notification), { TTL: 3600, urgency: 'normal' }); sent += 1; }
      catch (error) { failed += 1; if (error?.statusCode === 404 || error?.statusCode === 410) await subscriptionRepository.removeById(config, row.id); }
    }
    await saveState(config, inspection, { lastResult: sent ? `sent:${sent};failed:${failed}` : `failed:${failed}`, lastSentAt: sent ? inspection.evaluatedAt : null });
    if (!sent) throw httpError(502, 'Không gửi được cảnh báo số dư Quỹ tới thiết bị nào.');
    return publicResult(inspection, { dryRun: false, sent, failed });
  }
  return { dryRun, run, inspect };
}
module.exports = { createFundLowBalanceAlertService, RULE_KEY, PREFERENCE_KEY, THRESHOLD, COOLDOWN_MS, NOTIFICATION, vietnamDateParts };
