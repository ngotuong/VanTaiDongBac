const assert = require('node:assert/strict');
const test = require('node:test');
const { createFundLowBalanceAlertService, THRESHOLD, NOTIFICATION } = require('../server/services/fund-low-balance-alert-service');

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

function fixture({ balance = THRESHOLD - 1, lastSentAt = null, conditionActive = false, subscriptions = 2, disabledUserIds = [] } = {}) {
  const writes = [];
  const deliveries = [];
  const removed = [];
  const service = createFundLowBalanceAlertService({
    balanceRepository: { async currentBalance() { return { value: balance, syncedAt: '2026-07-30T00:00:00Z', monthKey: '2026-07' }; } },
    ruleRepository: {
      async find() { return lastSentAt || conditionActive ? { condition_active: conditionActive, last_sent_at: lastSentAt } : null; },
      async upsert(_config, row) { writes.push(row); return row; }
    },
    ruleConfigRepository: { async find() { return { rule_key: 'fund-current-balance-below-10m', enabled: true, threshold_value: THRESHOLD, cooldown_minutes: 1440, recipient_roles: ['admin', 'shareholder'], notification_body: NOTIFICATION.body }; } },
    preferenceRepository: { async listByUserIds() { return disabledUserIds.map((user_id) => ({ user_id, notification_key: 'fund-low-balance', enabled: false })); } },
    appUserRepository: { async list() { return [
      { user_id: 'admin-1', role: 'admin', active: true },
      { user_id: 'shareholder-1', role: 'shareholder', active: true },
      { user_id: 'operator-1', role: 'operator', active: true },
      { user_id: 'disabled-1', role: 'admin', active: false }
    ]; } },
    subscriptionRepository: {
      async listByUserIds(_config, ids) {
        assert.deepEqual(ids, disabledUserIds.includes('shareholder-1') ? ['admin-1'] : ['admin-1', 'shareholder-1']);
        return Array.from({ length: subscriptions }, (_, index) => ({ id: `sub-${index}`, endpoint: `https://push.example/${index}`, p256dh: 'p', auth_secret: 'a' }));
      },
      async removeById(_config, id) { removed.push(id); }
    },
    webPush: {
      setVapidDetails() {},
      async sendNotification(subscription, payload) { deliveries.push({ subscription, payload }); }
    },
    httpError,
    now: () => new Date('2026-07-30T01:00:00.000Z')
  });
  const config = { supabaseUrl: 'https://db.example', serviceRoleKey: 'service', vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'https://dongbac.vercel.app', defaultWorkbookYear: '2026', fundLowBalanceAlertEnabled: true };
  return { service, config, writes, deliveries, removed };
}

test('dry-run uses the currentBalance metric result and never sends or mutates state', async () => {
  const context = fixture();
  const result = await context.service.dryRun(context.config);
  assert.equal(result.balance, THRESHOLD - 1);
  assert.equal(result.underThreshold, true);
  assert.equal(result.wouldSend, true);
  assert.equal(result.eligibleUserCount, 2);
  assert.equal(result.subscriptionCount, 2);
  assert.equal(result.notificationBody, 'Số dư quỹ đã xuống dưới ngưỡng 10 triệu');
  assert.equal(context.deliveries.length, 0);
  assert.equal(context.writes.length, 0);
});

test('an explicit per-user preference removes that account and its devices from delivery', async () => {
  const context = fixture({ disabledUserIds: ['shareholder-1'], subscriptions: 1 });
  const result = await context.service.dryRun(context.config);
  assert.equal(result.eligibleUserCount, 1);
  assert.equal(result.subscriptionCount, 1);
});

test('live rule sends to admin and shareholder devices then records the 24-hour boundary', async () => {
  const context = fixture();
  const result = await context.service.run(context.config);
  assert.equal(result.sent, 2);
  assert.equal(context.deliveries.length, 2);
  assert.equal(JSON.parse(context.deliveries[0].payload).body, NOTIFICATION.body);
  assert.equal(context.writes[0].condition_active, true);
  assert.equal(context.writes[0].last_sent_at, '2026-07-30T01:00:00.000Z');
});

test('active low-balance state suppresses a repeat before 24 hours', async () => {
  const context = fixture({ conditionActive: true, lastSentAt: '2026-07-29T02:00:00.000Z' });
  const result = await context.service.run(context.config);
  assert.equal(result.skipped, 'cooldown');
  assert.equal(context.deliveries.length, 0);
  assert.equal(context.writes[0].last_result, 'cooldown');
});

test('low balance is sent again after 24 hours and safe balance resets the condition', async () => {
  const repeat = fixture({ conditionActive: true, lastSentAt: '2026-07-29T01:00:00.000Z' });
  assert.equal((await repeat.service.run(repeat.config)).sent, 2);
  const safe = fixture({ balance: THRESHOLD, conditionActive: true, lastSentAt: '2026-07-29T01:00:00.000Z' });
  const result = await safe.service.run(safe.config);
  assert.equal(result.skipped, 'balance_not_below_threshold');
  assert.equal(safe.writes[0].condition_active, false);
  assert.equal(safe.deliveries.length, 0);
});

test('live rule stays disabled until production activation', async () => {
  const context = fixture();
  context.config.fundLowBalanceAlertEnabled = false;
  await assert.rejects(() => context.service.run(context.config), /chưa được kích hoạt/);
});
