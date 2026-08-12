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
  assert.equal(sent[0].unreadCount, 2);
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
