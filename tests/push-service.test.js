const assert = require('node:assert/strict');
const test = require('node:test');
const { createPushService, TEST_NOTIFICATION } = require('../server/services/push-service');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const config = {
  serviceRoleKey: 'service',
  vapidPublicKey: 'public-vapid',
  vapidPrivateKey: 'private-vapid',
  vapidSubject: 'https://dongbac.vercel.app'
};
const user = { id: 'user-1' };
const endpoint = 'https://push.example/device-one';
const subscription = { endpoint, keys: { p256dh: 'device-public-key', auth: 'device-secret' } };

test('PushService stores only the authenticated user subscription and exposes the public key', async () => {
  const calls = [];
  const repository = {
    listByUser: async (_config, userId) => { calls.push(['list', userId]); return [{ id: 'one' }]; },
    upsert: async (_config, userId, value) => { calls.push(['upsert', userId, value.endpoint]); }
  };
  const service = createPushService({ repository, webPush: {}, httpError, now: () => new Date('2026-07-30T12:00:00Z') });
  assert.deepEqual(await service.status(config, user), { configured: true, publicKey: 'public-vapid', deviceCount: 1, types: [] });
  assert.deepEqual(await service.subscribe(config, user, subscription, 'Browser'), { subscribed: true });
  assert.deepEqual(calls, [['list', 'user-1'], ['upsert', 'user-1', endpoint]]);
});

test('PushService sends a generic test only to the current device endpoint', async () => {
  const sent = [];
  const repository = {
    findByUserAndEndpoint: async (_config, userId, value) => {
      assert.equal(userId, 'user-1');
      assert.equal(value, endpoint);
      return { endpoint, p256dh: 'device-public-key', auth_secret: 'device-secret' };
    },
    remove: async () => { throw new Error('must not remove healthy subscription'); }
  };
  const webPush = {
    setVapidDetails: (...args) => sent.push(['vapid', ...args]),
    sendNotification: async (...args) => sent.push(['send', ...args])
  };
  const service = createPushService({ repository, webPush, httpError });
  assert.deepEqual(await service.sendTest(config, user, endpoint), { sent: true });
  assert.deepEqual(sent[0], ['vapid', config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey]);
  assert.deepEqual(JSON.parse(sent[1][2]), TEST_NOTIFICATION);
  assert.equal(sent[1][1].endpoint, endpoint);
});

test('PushService removes an expired endpoint after a 410 from the push provider', async () => {
  let removed = false;
  const repository = {
    findByUserAndEndpoint: async () => ({ endpoint, p256dh: 'key', auth_secret: 'secret' }),
    remove: async (_config, userId, value) => { removed = userId === 'user-1' && value === endpoint; }
  };
  const webPush = {
    setVapidDetails() {},
    sendNotification: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); }
  };
  const service = createPushService({ repository, webPush, httpError });
  await assert.rejects(() => service.sendTest(config, user, endpoint), { status: 410 });
  assert.equal(removed, true);
});

test('PushService rejects malformed endpoints and missing VAPID configuration', async () => {
  const service = createPushService({ repository: {}, webPush: {}, httpError });
  await assert.rejects(() => service.subscribe(config, user, { endpoint: 'javascript:bad', keys: {} }, ''), { status: 400 });
  await assert.rejects(() => service.status({ ...config, vapidPrivateKey: '' }, user), { status: 503 });
});
