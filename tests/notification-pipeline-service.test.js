const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationPipelineService.gs'), 'utf8');

function createHarness(options = {}) {
  const properties = { ...(options.properties || {}) };
  const statuses = [];
  const logs = [];
  const calls = [];
  const failures = new Set(options.failures || []);
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  const step = (name) => () => {
    calls.push(name);
    if (failures.has(name)) throw new Error(`technical failure at https://secret.test/${name}`);
    return { ok: true };
  };
  const context = {
    nowMillis: 1000000,
    nowISOString: '2026-09-01T10:00:00.000Z',
    nextAtKey: 'NEXT', failureCountKey: 'FAILURES',
    intervalMs: 300000, retryMs: 60000, failureThreshold: 3,
    getProperty: (key) => properties[key],
    setProperty: (key, value) => { properties[key] = value; },
    deleteProperty: (key) => { delete properties[key]; },
    runStep(results, errors, name, fn) {
      try { results.push({ name, result: fn() }); } catch (error) { errors.push({ name, error: error.message }); }
    },
    syncTripNotifications: step('tripNotifications'),
    syncOperationalNotifications: step('operationalNotifications'),
    syncDailyBusinessSummary: step('dailyBusinessSummary'),
    dispatchNotifications: step('notificationDispatch'),
    writeStatus: (...args) => statuses.push(args),
    log: (message) => logs.push(message)
  };
  return { service: sandbox.NotificationPipelineService, context, properties, statuses, logs, calls, failures };
}

test('one transient sync failure is retried soon without raising a user-visible status', () => {
  const harness = createHarness({ failures: ['dailyBusinessSummary'] });
  const result = harness.service.run(harness.context);
  assert.equal(result.ok, false);
  assert.equal(result.consecutiveFailures, 1);
  assert.equal(result.alertRaised, false);
  assert.equal(harness.properties.NEXT, '1060000');
  assert.equal(harness.properties.FAILURES, '1');
  assert.equal(harness.statuses.length, 0);
  assert.deepEqual(harness.calls, ['tripNotifications', 'operationalNotifications', 'dailyBusinessSummary']);
  assert.doesNotMatch(harness.logs[0], /https:|secret|technical failure/);
});

test('the third consecutive failure raises one sanitized status and dispatches it', () => {
  const harness = createHarness({ properties: { FAILURES: '2' }, failures: ['dailyBusinessSummary'] });
  const result = harness.service.run(harness.context);
  assert.equal(result.consecutiveFailures, 3);
  assert.equal(result.alertRaised, true);
  assert.equal(harness.statuses.length, 1);
  assert.equal(harness.statuses[0][2], 'error');
  assert.match(harness.statuses[0][3], /3 lần thử liên tiếp/);
  assert.doesNotMatch(harness.statuses[0][3], /https:|manage_data_bundles|Address unavailable|\[/);
  assert.equal(harness.calls.at(-1), 'notificationDispatch');
});

test('recovery clears the prior error before dispatch so stale failures are not pushed', () => {
  const harness = createHarness({ properties: { FAILURES: '3' } });
  const result = harness.service.run(harness.context);
  assert.equal(result.ok, true);
  assert.equal(harness.properties.FAILURES, undefined);
  assert.equal(harness.statuses[0][2], 'ok');
  assert.equal(harness.calls.at(-1), 'notificationDispatch');
});

test('a dispatch failure also needs three consecutive failed ticks before alerting', () => {
  const harness = createHarness({ properties: { FAILURES: '1' }, failures: ['notificationDispatch'] });
  const result = harness.service.run(harness.context);
  assert.equal(result.consecutiveFailures, 2);
  assert.equal(result.alertRaised, false);
  assert.equal(harness.statuses.length, 0);
  assert.equal(harness.properties.FAILURES, '2');
});

function stagedHarness(duration = 30000) {
  const h = createHarness(); let now = h.context.nowMillis;
  h.context.cursorKey = 'CURSOR'; h.context.now = () => now;
  for (const key of ['syncTripNotifications', 'syncOperationalNotifications', 'syncDailyBusinessSummary', 'dispatchNotifications']) {
    const fn = h.context[key]; h.context[key] = () => { now += duration; return fn(); };
  }
  h.turn = () => { h.context.nowMillis = now; h.context.deadlineMillis = now + 45000; return h.service.run(h.context); };
  h.advance = (ms) => { now += ms; };
  return h;
}

test('staged notification pipeline resumes after the budget and marks freshness only after all steps', () => {
  const h = stagedHarness(); const first = h.turn();
  assert.equal(first.continuing, true); assert.equal(JSON.parse(h.properties.CURSOR).index, 2);
  assert.equal(h.properties.NEXT, undefined); assert.equal(h.statuses.length, 0);
  const second = h.turn(); assert.equal(second.ok, true); assert.equal(second.continuing, undefined);
  assert.deepEqual(h.calls, ['tripNotifications', 'operationalNotifications', 'dailyBusinessSummary', 'notificationDispatch']);
  assert.equal(h.properties.CURSOR, undefined); assert.equal(h.statuses.length, 1);
  assert.equal(h.turn().checked, false);
});

test('staged failure retries the same cursor, raises sanitized hysteresis, and dispatches the alert on a later turn', () => {
  const h = stagedHarness(1000); h.failures.add('operationalNotifications');
  for (let i = 0; i < 3; i++) { assert.equal(h.turn().ok, false); h.advance(60000); }
  assert.equal(h.statuses.length, 1); assert.equal(h.statuses[0][2], 'error');
  assert.equal(JSON.parse(h.properties.CURSOR).index, 1);
  assert.equal(JSON.parse(h.properties.CURSOR).alertPending, true);
  assert.deepEqual(h.calls, ['tripNotifications', 'operationalNotifications', 'operationalNotifications', 'operationalNotifications']);
  h.failures.clear(); const r = h.turn(); assert.equal(r.ok, true);
  assert.deepEqual(h.calls.slice(-4), ['notificationDispatch', 'operationalNotifications', 'dailyBusinessSummary', 'notificationDispatch']);
  assert.equal(h.properties.FAILURES, undefined); assert.equal(h.properties.CURSOR, undefined);
});

test('crash before cursor persistence replays only that idempotent source step', () => {
  const h = stagedHarness(1000); const save = h.context.setProperty;
  let failed = false;
  h.context.setProperty = (k, v) => { if (k === 'CURSOR' && !failed) { failed = true; throw Error('durable storage failure'); } save(k, v); };
  assert.throws(h.turn, /durable storage failure/); assert.equal(h.properties.NEXT, undefined);
  assert.equal(h.turn().ok, true);
  assert.deepEqual(h.calls, ['tripNotifications', 'tripNotifications', 'operationalNotifications', 'dailyBusinessSummary', 'notificationDispatch']);
});


test('staged pipeline rejects ok:false dispatch/source results and retains their cursor for retry', () => {
  for (const key of ['syncDailyBusinessSummary', 'dispatchNotifications']) {
    const h = stagedHarness(1000); h.context[key] = () => ({ ok: false, errors: ['private failure'] });
    const r = h.turn(); assert.equal(r.ok, false); assert.equal(h.statuses.length, 0);
    assert.equal(JSON.parse(h.properties.CURSOR).index, key === 'syncDailyBusinessSummary' ? 2 : 3);
    assert.equal(h.properties.FAILURES, '1'); assert.doesNotMatch(h.logs.join(' '), /private failure/);
  }
});


test('persistent staged dispatch failure stays in error until delivery succeeds', () => {
  const h = stagedHarness(1000); h.failures.add('notificationDispatch');
  for (let i = 0; i < 4; i++) { assert.equal(h.turn().ok, false); h.advance(60000); }
  assert.equal(h.properties.FAILURES, '4'); assert.equal(h.statuses.length, 1); assert.equal(h.statuses[0][2], 'error');
  assert.equal(JSON.parse(h.properties.CURSOR).index, 3);
  h.failures.clear(); assert.equal(h.turn().ok, true); assert.equal(h.statuses.at(-1)[2], 'ok');
  assert.equal(h.properties.FAILURES, undefined);
});


test('alert delivery outage cannot prevent recovery of source notification bundles', () => {
  const h = stagedHarness(1000); h.failures.add('operationalNotifications');
  for (let i = 0; i < 3; i++) { h.turn(); h.advance(60000); }
  h.failures.delete('operationalNotifications'); h.failures.add('notificationDispatch');
  const r = h.turn(); assert.equal(r.ok, false);
  assert.deepEqual(h.calls.slice(-4), ['notificationDispatch', 'operationalNotifications', 'dailyBusinessSummary', 'notificationDispatch']);
  assert.equal(JSON.parse(h.properties.CURSOR).index, 3, 'source recovery progresses despite failed alert');
});

test('cursor property outage retains progress and does not restart sources silently', () => {
  const h = stagedHarness(); h.turn(); const stored = h.properties.CURSOR; const calls = h.calls.length;
  const get = h.context.getProperty; h.context.getProperty = (k) => { if (k === 'CURSOR') throw Error('storage outage'); return get(k); };
  assert.throws(h.turn, /storage outage/); assert.equal(h.properties.CURSOR, stored); assert.equal(h.calls.length, calls);
});
