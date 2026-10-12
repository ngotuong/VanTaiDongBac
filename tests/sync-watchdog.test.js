const assert = require('node:assert/strict');
const test = require('node:test');

const { createSyncWatchdog, isAuthorizationFailure, recoveryStatus, recoveryFailure } = require('../api/sync-watchdog');

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; }
  };
}

function withEnvironment(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const environment = {
  BUSINESS_WRITES_PAUSED: 'false',
  SYNC_WATCHDOG_SECRET: 'watchdog-secret',
  SUPABASE_URL: 'https://lyquwesyjbpalnwfxzwl.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw/exec',
  APP_PROXY_SECRET: 'proxy-secret',
  EXPECTED_APP_ID: '',
  EXPECTED_SUPABASE_PROJECT_REF: '',
  EXPECTED_VERCEL_PROJECT_ID: '',
  EXPECTED_APPS_SCRIPT_ID: ''
};

test('maintenance suppresses watchdog reads, writes and trigger recovery even for a forced authenticated request', async () => withEnvironment({ ...environment, BUSINESS_WRITES_PAUSED: 'true' }, async () => {
  let calls = 0;
  const handler = createSyncWatchdog({ fetchImpl: async () => { calls++; throw new Error('No upstream call is allowed during maintenance.'); } });
  for (const method of ['GET', 'POST']) {
    const res = responseRecorder();
    await handler({ method, headers: { authorization: 'Bearer watchdog-secret' }, body: { force: true } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).skipped, true);
    assert.match(JSON.parse(res.body).reason, /Maintenance/);
  }
  const denied = responseRecorder();
  await handler({ method: 'GET', headers: {} }, denied);
  assert.equal(denied.statusCode, 401);
  assert.equal(calls, 0);
}));

test('sync watchdog skips recovery while the worker heartbeat is fresh', async () => withEnvironment(environment, async () => {
  let upstreamCalls = 0;
  const handler = createSyncWatchdog({
    now: () => new Date('2026-08-20T04:00:00.000Z'),
    fetchImpl: async () => {
      upstreamCalls++;
      return { ok: true, json: async () => [{ sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-20T03:55:00.000Z' }] };
    }
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer watchdog-secret' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).skipped, true);
  assert.equal(upstreamCalls, 2);
}));

test('sync watchdog reinstalls triggers and runs a sync tick when heartbeat is stale', async () => withEnvironment(environment, async () => {
  const requests = [];
  const handler = createSyncWatchdog({
    now: () => new Date('2026-08-20T04:00:00.000Z'),
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/rest/v1/sync_status') && !init.method) {
        return { ok: true, json: async () => [{ sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' }] };
      }
      if (String(url).includes('/rest/v1/sync_status') && init.method === 'POST') return { ok: true };
      return { ok: true, text: async () => JSON.stringify({ ok: true, triggers: { ok: true }, sync: { ok: true } }) };
    }
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer watchdog-secret' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).recovered, true);
  const payload = JSON.parse(requests.find((request) => request.url.includes('script.google.com')).init.body);
  assert.equal(payload.action, 'recoverSyncInfrastructure');
  assert.equal(payload.proxySecret, 'proxy-secret');
  const statusPayload = JSON.parse(requests.find((request) => request.url.includes('/rest/v1/sync_status') && request.init.method === 'POST').init.body);
  assert.equal(statusPayload[0].status, 'ok');
}));

test('authenticated POST canary forces the same recovery path without falsifying heartbeat data', async () => withEnvironment(environment, async () => {
  const requests = [];
  const handler = createSyncWatchdog({
    now: () => new Date('2026-08-20T04:00:00.000Z'),
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/rest/v1/sync_status') && !init.method) {
        return { ok: true, json: async () => [{ sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-20T03:59:00.000Z' }] };
      }
      if (String(url).includes('/rest/v1/sync_status') && init.method === 'POST') return { ok: true };
      return { ok: true, text: async () => JSON.stringify({ ok: true, triggers: { ok: true }, sync: { ok: true } }) };
    }
  });
  const res = responseRecorder();
  await handler({ method: 'POST', headers: { authorization: 'Bearer watchdog-secret' }, body: { force: true } }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.recovered, true);
  assert.equal(body.forced, true);
  assert.equal(requests.some((request) => request.url.includes('script.google.com')), true);
}));

test('sync watchdog rejects unauthenticated callers before reading data', async () => withEnvironment(environment, async () => {
  let called = false;
  const handler = createSyncWatchdog({ fetchImpl: async () => { called = true; } });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
}));

test('sync watchdog records deployment access denial without guessing OAuth revocation', async () => withEnvironment(environment, async () => {
  const statusWrites = [];
  const handler = createSyncWatchdog({
    now: () => new Date('2026-08-20T04:00:00.000Z'),
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('/rest/v1/sync_status') && !init.method) {
        return { ok: true, json: async () => [{ sync_key: 'realtime_cache_worker', status: 'ok', updated_at: '2026-08-19T08:43:00.000Z' }] };
      }
      if (String(url).includes('/rest/v1/sync_status') && init.method === 'POST') {
        statusWrites.push(JSON.parse(init.body)[0]);
        return { ok: true };
      }
      return { ok: false, status: 403, text: async () => '' };
    }
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer watchdog-secret' } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(statusWrites[0].status, 'deployment_access_denied');
}));

test('sync watchdog keeps non-authorization recovery failures distinct', () => {
  assert.equal(isAuthorizationFailure('Apps Script trả status 403.'), false);
  assert.equal(isAuthorizationFailure('Authorization is required to perform that action.'), true);
  assert.equal(isAuthorizationFailure('Realtime sync failed.'), false);
  assert.equal(recoveryStatus({ body: { code: 'APPS_SCRIPT_ACCESS_DENIED', upstreamStatus: 403 } }, 'Không thể truy cập Apps Script deployment.'), 'deployment_access_denied');
  assert.equal(recoveryStatus({ body: { error: 'Authorization is required to perform that action.' } }, 'Authorization is required to perform that action.'), 'authorization_required');
  assert.match(recoveryFailure({ status: 400, body: { ok: false, sync: { errors: [{ error: 'Realtime sync failed.' }] } } }), /Realtime sync failed/);
});

test('Apps Script exposes a read-only authorization diagnostic outside the public action registry', () => {
  const fs = require('node:fs');
  const publicApi = fs.readFileSync('PublicApi.gs', 'utf8');
  const registry = fs.readFileSync('ApiActionRegistry.gs', 'utf8');
  assert.match(publicApi, /function diagnoseSyncAuthorization\(\)/);
  assert.match(publicApi, /ScriptApp\.getAuthorizationInfo\(ScriptApp\.AuthMode\.FULL\)/);
  assert.match(publicApi, /ScriptApp\.getProjectTriggers\(\)/);
  assert.doesNotMatch(registry, /diagnoseSyncAuthorization/);
});

test('Apps Script recovery and worker heartbeat fail closed', () => {
  const fs = require('node:fs');
  const publicApi = fs.readFileSync('PublicApi.gs', 'utf8');
  const supabase = fs.readFileSync('SupabaseService.gs', 'utf8');
  const recovery = publicApi.slice(publicApi.indexOf('function recoverSyncInfrastructure()'), publicApi.indexOf('function handleTransportSheetEdit'));
  assert.match(recovery, /ok: Boolean\(triggers && triggers\.ok !== false && sync && sync\.ok !== false\)/);
  const heartbeat = supabase.indexOf('writeRealtimeHeartbeatIfDue_(props, nowMillis, pendingClaim, pendingFundClaim)');
  const pendingReturn = supabase.indexOf("if (pendingWork.key === 'transport')", heartbeat);
  assert.ok(heartbeat > 0 && heartbeat < pendingReturn);
});

test('watchdog workflow checks production every five minutes using only an encrypted secret', () => {
  const fs = require('node:fs');
  const workflow = fs.readFileSync('.github/workflows/sync-watchdog.yml', 'utf8');
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /secrets\.SYNC_WATCHDOG_SECRET/);
  assert.match(workflow, /https:\/\/dongbac\.vercel\.app\/api\/sync-watchdog\//);
  assert.doesNotMatch(workflow, /watchdog-secret|proxy-secret/);
});
