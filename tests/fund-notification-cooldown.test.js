const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createFundLowBalanceAlertService, RULE_KEY, FUND_NOTIFICATION_ID } = require('../server/services/fund-low-balance-alert-service');
const { createNotificationRuleRepository } = require('../server/repositories/notification-rule-repository');
const { createNotificationCenterService: createNotificationCenterServiceRaw } = require('../server/services/notification-center-service');
const createNotificationCenterService = (options) => createNotificationCenterServiceRaw({
  ...options,
  workbookContextService: { resolve: () => ({ year: '2026' }) }
});
const { createNotificationDispatchService, BASELINE_KEY } = require('../server/services/notification-dispatch-service');

function fixture({ deviceCount = 1, cooldownMinutes = 1440 } = {}) {
  let current = new Date('2026-10-13T15:00:00Z');
  let balance = 2000000;
  const states = new Map([[BASELINE_KEY, { rule_key: BASELINE_KEY }]]);
  const deliveries = [];
  const failures = new Map();
  const removed = [];
  let failCompletion = false;
  const config = { supabaseUrl: 'https://local.invalid', serviceRoleKey: 'unused', vapidPublicKey: 'unused', vapidPrivateKey: 'unused', vapidSubject: 'mailto:unused@example.invalid', fundLowBalanceAlertEnabled: true };
  const rule = { enabled: true, threshold_value: 10000000, cooldown_minutes: cooldownMinutes, recipient_roles: ['admin', 'shareholder'], notification_body: 'Số dư Quỹ thấp' };
  const subscriptions = Array.from({ length: deviceCount }, (_, i) => ({ id: `device-${i}`, endpoint: `https://fcm.googleapis.com/synthetic-${i}`, p256dh: 'unused', auth_secret: 'unused' }));
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  // In-memory PostgREST adapter: conditional PATCH is atomic, like one database UPDATE.
  const repository = createNotificationRuleRepository({ httpError, fetchImpl: async (input, options = {}) => {
    const query = new URL(input).searchParams;
    const body = options.body ? JSON.parse(options.body) : null;
    if (options.method === 'POST') {
      if (!options.headers.Prefer.includes('ignore-duplicates') || !states.has(body.rule_key)) states.set(body.rule_key, { ...states.get(body.rule_key), ...body });
      return Response.json([states.get(body.rule_key)]);
    }
    const key = query.get('rule_key').slice(3);
    const previous = states.get(key);
    if (options.method === 'PATCH') {
      const matches = previous && [...query.entries()].every(([field, predicate]) => {
        if (field === 'rule_key') return true;
        return predicate === 'is.null' ? previous[field] == null : previous[field] === predicate.slice(3);
      });
      if (!matches) return Response.json([]);
      if (failCompletion && query.has('last_result')) return Response.json({ message: 'injected persistence failure' }, { status: 500 });
      const updated = { ...previous, ...body };
      states.set(key, updated);
      return Response.json([updated]);
    }
    return Response.json(previous ? [previous] : []);
  } });
  const service = createFundLowBalanceAlertService({
    balanceRepository: { currentBalance: async () => ({ value: balance, syncedAt: current.toISOString(), monthKey: '2026-10' }) },
    ruleRepository: repository, ruleConfigRepository: { find: async () => rule },
    preferenceRepository: { listByUserIds: async () => [] },
    appUserRepository: { list: async () => [{ user_id: 'synthetic-admin', role: 'admin', active: true }] },
    subscriptionRepository: { listByUserIds: async () => subscriptions.filter(s => !removed.includes(s.id)), removeById: async (_c, id) => removed.push(id) },
    webPush: { setVapidDetails() {}, sendNotification: async (device, payload) => {
      if (failures.has(device.endpoint)) throw failures.get(device.endpoint);
      deliveries.push({ endpoint: device.endpoint, payload: JSON.parse(payload) });
    } }, httpError, now: () => current
  });
  const center = createNotificationCenterService({ repository: { find: async () => ({ fund: { rule, bundle: { payload: { metrics: [{ key: 'currentBalance', value: balance }] }, synced_at: current.toISOString() } }, syncStatuses: [], writeJobs: [] }) }, now: () => current });
  const dispatcher = createNotificationDispatchService({ centerService: center, fundAlertService: service,
    deliveryRepository: { list: async (_c, keys) => keys.filter(k => states.has(k)).map(k => states.get(k)), upsert: async (_c, rows) => rows.forEach(r => states.set(r.rule_key, r)) },
    httpError, now: () => current });
  return { config, rule, states, service, center, dispatcher, deliveries, failures, subscriptions, removed,
    advance: minutes => { current = new Date(current.getTime() + minutes * 60000); },
    setBalance: value => { balance = value; }, failCompletion: () => { failCompletion = true; } };
}

test('15 half-hour resyncs keep one Fund item and one push; exact 24-hour reminder keeps the badge', async () => {
  const f = fixture();
  const id = (await f.center.list(f.config)).items[0].id;
  await f.dispatcher.run(f.config);
  for (let i = 0; i < 15; i++) {
    f.advance(30);
    await f.dispatcher.run(f.config);
    const center = await f.center.list(f.config);
    assert.equal(center.items.length, 1);
    assert.equal(center.items[0].id, id);
  }
  assert.equal(f.deliveries.length, 1);
  f.advance(990); // 450 + 990 = 1440 minutes since the first delivery.
  await f.dispatcher.run(f.config);
  assert.equal(f.deliveries.length, 2);
  assert.equal(f.deliveries[1].payload.notificationId, FUND_NOTIFICATION_ID);
  assert.equal(f.deliveries[1].payload.preserveBadge, true);
});

test('configured interval, balance changes and safe-to-low transitions do not bypass cooldown', async () => {
  const f = fixture({ cooldownMinutes: 120 });
  await f.service.dispatch(f.config);
  f.advance(30); f.setBalance(3000000);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  f.setBalance(10000000);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'balance_not_below_threshold');
  f.setBalance(1000000); f.advance(89);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  f.advance(1);
  assert.equal((await f.service.dispatch(f.config)).sent, 1);
  f.rule.enabled = false; f.advance(120);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'rule_disabled');
  assert.equal(f.deliveries.length, 2);
});

test('partial failure retries only the failed device, including accurate dry-run eligibility', async () => {
  const f = fixture({ deviceCount: 2 });
  f.failures.set(f.subscriptions[1].endpoint, { statusCode: 503 });
  assert.equal((await f.service.dispatch(f.config)).failed, 1);
  f.failures.clear(); f.advance(5);
  assert.equal((await f.service.dryRun(f.config)).wouldSend, true);
  assert.equal((await f.service.dispatch(f.config)).sent, 1);
  assert.equal(f.deliveries.length, 2);
  assert.equal(f.deliveries[1].endpoint, f.subscriptions[1].endpoint);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
});

test('pipeline and legacy scheduled delivery share atomic device reservations', async () => {
  const f = fixture();
  await Promise.all([f.dispatcher.run(f.config), f.service.run(f.config)]);
  assert.equal(f.deliveries.length, 1);
  assert.ok([...f.states.keys()].some(k => k.startsWith(`${RULE_KEY}:device:`)));
});

test('uncertain push timeout retains cooldown; expired subscriptions are removed', async () => {
  const f = fixture();
  f.failures.set(f.subscriptions[0].endpoint, new Error('timeout after possible acceptance'));
  await assert.rejects(f.service.dispatch(f.config), /Không gửi được/);
  f.failures.clear(); f.advance(30);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  assert.equal(f.deliveries.length, 0);
  const expired = fixture();
  expired.failures.set(expired.subscriptions[0].endpoint, { statusCode: 410 });
  await assert.rejects(expired.service.dispatch(expired.config), /Không gửi được/);
  assert.deepEqual(expired.removed, ['device-0']);
});

test('crash after accepted push and before completion cannot repeat the push on retry', async () => {
  const f = fixture(); f.failCompletion();
  await assert.rejects(f.service.dispatch(f.config), /persistence failure/);
  assert.equal(f.deliveries.length, 1);
  f.advance(30);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  assert.equal(f.deliveries.length, 1);
});

test('legacy last-sent state prevents an immediate resend when device state is first initialized', async () => {
  const f = fixture();
  f.states.set(RULE_KEY, { rule_key: RULE_KEY, last_sent_at: '2026-10-13T14:00:00.000Z', condition_active: true });
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  assert.equal(f.deliveries.length, 0);
});

test('disabled Fund rule cannot block other notifications when Fund balance cache is unavailable', async () => {
  const service = createFundLowBalanceAlertService({
    ruleConfigRepository: { find: async () => ({ enabled: false }) },
    balanceRepository: { currentBalance: async () => { throw new Error('must not read missing Fund cache'); } }
  });
  assert.equal((await service.dispatch({})).skipped, 'rule_disabled');
});

test('current legacy Fund push state carries its last-send time into the canonical device cooldown', async () => {
  const f = fixture();
  const legacy = crypto.createHash('sha256').update('fund-low-balance|10000000|2000000|2026-10-13T15:00:00.000Z').digest('hex').slice(0, 32);
  const endpoint = crypto.createHash('sha256').update(f.subscriptions[0].endpoint).digest('hex').slice(0, 40);
  const key = `notification-event:${legacy}:device:${endpoint}`;
  f.states.set(key, { rule_key: key, last_result: 'sent', last_sent_at: '2026-10-13T14:00:00.000Z' });
  assert.equal((await f.service.dryRun(f.config)).wouldSend, false);
  assert.equal((await f.service.dispatch(f.config)).skipped, 'cooldown');
  assert.equal(f.deliveries.length, 0);
});
