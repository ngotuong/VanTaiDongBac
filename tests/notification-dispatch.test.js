const assert = require('node:assert/strict');
const test = require('node:test');
const { createNotificationDispatchService } = require('../server/services/notification-dispatch-service');
const { createNotificationDeliveryRepository } = require('../server/repositories/notification-delivery-repository');

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

test('first dispatch baselines active alerts and only pushes later events', async () => {
  const states = new Map();
  const sent = [];
  let items = [{ id: 'old-1', notificationKey: 'trip-reconciliation', message: 'Cũ', url: '/entry/' }];
  const service = createNotificationDispatchService({
    centerService: { async list() { return { items }; } },
    deliveryRepository: {
      async list(_config, keys) { return keys.filter((key) => states.has(key)).map((key) => states.get(key)); },
      async upsert(_config, rows) { for (const row of rows) states.set(row.rule_key, row); return rows; }
    },
    preferenceRepository: { async listByUserIds() { return []; } },
    appUserRepository: { async list() { return [{ user_id: 'admin-1', role: 'admin', active: true }]; } },
    subscriptionRepository: {
      async listByUserIds() { return [{ id: 'device-1', endpoint: 'https://push.test/1', p256dh: 'key', auth_secret: 'secret' }]; },
      async removeById() {}
    },
    webPush: { setVapidDetails() {}, async sendNotification(_subscription, payload) { sent.push(JSON.parse(payload)); } },
    httpError,
    now: () => new Date('2026-08-12T10:00:00.000Z')
  });
  const config = { supabaseUrl: 'https://db.test', serviceRoleKey: 'service', vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'mailto:test@example.com' };
  const first = await service.run(config);
  assert.equal(first.baselineCreated, true);
  assert.equal(sent.length, 0);
  items = [...items, { id: 'new-1', notificationKey: 'trip-reconciliation', message: 'Mới', url: '/entry/' }];
  const second = await service.run(config);
  assert.equal(second.immediate.newItemCount, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].unreadDelta, 1);
  assert.equal('unreadCount' in sent[0], false);
});

test('daily digest reports exact transport activity and preserves the unread badge', async () => {
  const states = new Map();
  const sent = [];
  const center = {
    items: [],
    dailySummary: {
      date: '2026-08-12', trips: 12.5, vehicleCount: 4,
      volume: 300.25, revenue: 32000000, projectCount: 3,
      fundAvailable: true, fundIncome: 5000000, fundExpense: 7000000, fundNet: -2000000
    }
  };
  const service = createNotificationDispatchService({
    centerService: { async list() { return center; } },
    deliveryRepository: {
      async list(_config, keys) { return keys.filter((key) => states.has(key)).map((key) => states.get(key)); },
      async upsert(_config, rows) { for (const row of rows) states.set(row.rule_key, row); return rows; }
    },
    preferenceRepository: { async listByUserIds() { return []; } },
    appUserRepository: { async list() { return [{ user_id: 'admin-1', role: 'admin', active: true }]; } },
    subscriptionRepository: {
      async listByUserIds() { return [{ id: 'device-1', endpoint: 'https://push.test/1', p256dh: 'key', auth_secret: 'secret' }]; },
      async removeById() {}
    },
    webPush: { setVapidDetails() {}, async sendNotification(_subscription, payload) { sent.push(JSON.parse(payload)); } },
    httpError,
    now: () => new Date('2026-08-13T05:00:00.000Z')
  });
  const config = { supabaseUrl: 'https://db.test', serviceRoleKey: 'service', vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'mailto:test@example.com' };
  await service.run(config);
  const result = await service.run(config);
  assert.equal(result.digest.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'Tổng hợp ngày 12/08/2026');
  assert.equal(sent[0].body, '12,5 chuyến · doanh thu 32.000.000 đ · chi Quỹ 7.000.000 đ · thu Quỹ 5.000.000 đ · 4 xe · 300,25 m³ · 3 dự án.');
  assert.equal(sent[0].url, '/dashboard/');
  assert.equal(sent[0].preserveBadge, true);
  assert.equal(sent[0].unreadDelta, 0);
});

test('daily digest skips outside noon and keys delivery by the previous Vietnam date', async () => {
  const states = new Map([['notification-dispatch-baseline-v1', { rule_key: 'notification-dispatch-baseline-v1' }]]);
  const service = createNotificationDispatchService({
    centerService: { async list() { return { items: [], dailySummary: null }; } },
    deliveryRepository: {
      async list(_config, keys) { return keys.filter((key) => states.has(key)).map((key) => states.get(key)); },
      async upsert(_config, rows) { for (const row of rows) states.set(row.rule_key, row); return rows; }
    },
    preferenceRepository: { async listByUserIds() { return []; } },
    appUserRepository: { async list() { return []; } },
    subscriptionRepository: { async listByUserIds() { return []; }, async removeById() {} },
    webPush: { setVapidDetails() {}, async sendNotification() {} },
    httpError,
    now: () => new Date('2026-08-13T04:55:00.000Z')
  });
  const config = { supabaseUrl: 'https://db.test', serviceRoleKey: 'service', vapidPublicKey: 'public', vapidPrivateKey: 'private', vapidSubject: 'mailto:test@example.com' };
  const result = await service.run(config);
  assert.equal(result.digest.skipped, true);
  assert.match(result.digest.reason, /12:00/);
  assert.equal(states.has('notification-digest:2026-08-12'), false);
});

test('Vietnam clock keeps the previous-day key correct across month and year boundaries', () => {
  const service = createNotificationDispatchService({});
  const clock = service.localClock(new Date('2027-01-01T05:00:00.000Z'));
  assert.equal(clock.dateKey, '2027-01-01');
  assert.equal(clock.previousDateKey, '2026-12-31');
  assert.equal(clock.hour, 12);
});

test('delivery state lookup chunks large event sets before calling PostgREST', async () => {
  const calls = [];
  const repository = createNotificationDeliveryRepository({
    fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => [] }; },
    httpError
  });
  await repository.list({ supabaseUrl: 'https://db.test', serviceRoleKey: 'service' }, Array.from({ length: 81 }, (_, index) => `event-${index}`));
  assert.equal(calls.length, 3);
});
