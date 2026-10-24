const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function worker({ cache = new Map(), appBadgeAvailable = true } = {}) {
  const handlers = {};
  let badge = 0;
  const navigator = appBadgeAvailable ? { setAppBadge: async count => { badge = count; }, clearAppBadge: async () => { badge = 0; } } : {};
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    Response, URL,
    caches: { open: async () => ({ match: async key => cache.get(key)?.clone(), put: async (key, response) => cache.set(key, response) }) },
    self: { addEventListener: (name, fn) => { handlers[name] = fn; }, navigator, registration: { showNotification: async () => {} } }
  });
  function fire(type, data) {
    let completion;
    handlers[type]({ data: type === 'push' ? { json: () => data } : data, waitUntil: promise => { completion = promise; } });
    return completion;
  }
  return { cache, push: data => fire('push', data), sync: (count, notificationIds) => fire('message', { type: 'SET_APP_BADGE', count, notificationIds }), badge: () => badge };
}

test('15 repeated pushes of the same alert leave one unread badge across worker restarts', async () => {
  let f = worker();
  for (let i = 0; i < 15; i++) {
    await f.push({ badgeIds: ['fund-rule'], notificationId: 'fund-rule', unreadDelta: 1 });
    assert.equal(f.badge(), 1);
    if (i === 7) f = worker({ cache: f.cache });
  }
});

test('reading an alert synchronizes its identity; retries and daily reminders cannot mark it unread', async () => {
  const f = worker();
  await f.sync(0, ['fund-rule']);
  await f.push({ badgeIds: ['fund-rule'], unreadDelta: 1 });
  assert.equal(f.badge(), 0);
  await f.push({ notificationId: 'fund-rule', preserveBadge: true, unreadDelta: 1 });
  assert.equal(f.badge(), 0);
  await f.push({ badgeIds: ['real-new-trip'], unreadDelta: 1 });
  assert.equal(f.badge(), 1);
});

test('concurrent and overlapping grouped pushes count distinct notifications without lost increments', async () => {
  const f = worker();
  await Promise.all([
    f.push({ badgeIds: ['fund', 'trip-a'], unreadDelta: 2 }),
    f.push({ badgeIds: ['fund', 'trip-b'], unreadDelta: 2 }),
    f.push({ badgeIds: ['trip-c'], unreadDelta: 1 })
  ]);
  assert.equal(f.badge(), 4);
});

test('legacy cached counts are corrected by app recount; digest and subsequent repeats preserve them', async () => {
  const cache = new Map([['/__vtdb_badge_state__', new Response(JSON.stringify({ count: 15 }))]]);
  const f = worker({ cache });
  await f.sync(1, ['fund']);
  await f.push({ badgeIds: ['fund'], unreadDelta: 1 });
  await f.push({ preserveBadge: true, unreadDelta: 0 });
  assert.equal(f.badge(), 1);
});

test('badge ledger stays usable on browsers without OS badging and stores only bounded IDs/count', async () => {
  const f = worker({ appBadgeAvailable: false });
  await f.sync(0, ['seen']);
  await f.push({ badgeIds: ['seen', 'new', 'new'], unreadDelta: 3 });
  const payload = await f.cache.get('/__vtdb_badge_state__').clone().json();
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.seenIds, ['seen', 'new']);
  assert.deepEqual(Object.keys(payload).sort(), ['count', 'seenIds']);
});
