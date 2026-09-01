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
  return { service: sandbox.NotificationPipelineService, context, properties, statuses, logs, calls };
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
