const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(properties = new Map()) {
  let now = 1000000, response = {}, persistFails = false;
  const calls = [], logs = [], sleeps = [], reads = [];
  if (!properties.has('SUPABASE_URL')) properties.set('SUPABASE_URL', 'https://isolated.test');
  if (!properties.has('SUPABASE_SERVICE_ROLE_KEY')) properties.set('SUPABASE_SERVICE_ROLE_KEY', 'fake-secret');
  class Clock extends Date { static now() { return now; } }
  const s = vm.createContext({ Date: Clock, console: { log: (x) => logs.push(x) }, normalizeCleanValue_: (x) => String(x || '').trim(),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => { reads.push(k); return properties.get(k); }, setProperty: (k, v) => { if (persistFails) throw Error('storage down'); properties.set(k, v); }, deleteProperty: (k) => properties.delete(k) }) },
    LockService: { getScriptLock: () => ({ hasLock: () => false, tryLock: () => true, releaseLock() {} }) },
    Utilities: { sleep: (ms) => { sleeps.push(ms); now += ms; } },
    UrlFetchApp: { fetch: (url, options) => { calls.push({ url, options }); now += response.elapsed || 0;
      if (response.error) throw Error(response.error); return { getResponseCode: () => response.status || 200, getContentText: () => response.body || '' }; } } });
  for (const f of ['SupabaseHttpClient.gs', 'WriteJobWorker.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), s);
  return { s, client: s.SupabaseHttpClient, properties, calls, logs, sleeps, reads, set: (x) => { response = x; }, advance: (ms) => { now += ms; }, persistFailure: () => { persistFails = true; } };
}

test('quota creates a durable cross-invocation cooldown; no fetch until expiry and no blind claim replay', () => {
  const h = harness(); h.set({ error: 'Bandwidth quota exceeded: https://private.test/rest/v1/rpc/claim_write_jobs' });
  assert.throws(() => h.client.callRpc('claim_write_jobs', { owner: 'private-user' }), (e) => e.transportDeferred && e.transportCategory === 'quota');
  assert.equal(h.calls.length, 1); assert.deepEqual(h.sleeps, []);
  const state = JSON.parse(h.properties.get('SUPABASE_HTTP_COOLDOWN_V1'));
  assert.equal(state.failures, 1); assert.ok(state.until >= 1300000 && state.until < 1330000);
  const restarted = harness(h.properties);
  assert.throws(() => restarted.client.callRpc('claim_write_jobs', {}), (e) => e.transportDeferred);
  assert.equal(restarted.calls.length, 0);
  restarted.advance(state.until - 1000000 + 1); restarted.client.callRpc('claim_write_jobs', {});
  assert.equal(restarted.calls.length, 1); assert.equal(restarted.properties.has('SUPABASE_HTTP_COOLDOWN_V1'), false);
  assert.doesNotMatch(h.logs.join('\n'), /private\.test|private-user|fake-secret|Authorization/);
});

test('slow transient fetch ends safe retries after 45s; it cannot interrupt the native call', () => {
  for (const response of [{ status: 503, elapsed: 180000 }, { error: 'Address unavailable', elapsed: 180000 }]) {
    const h = harness(); h.set(response);
    assert.throws(() => h.client.readRows('bundle', {}), (e) => e.transportDeferred);
    assert.equal(h.calls.length, 1); assert.deepEqual(h.sleeps, []);
    assert.match(h.logs.join('\n'), /"elapsedMs":180000/);
  }
});

test('RPC telemetry counts UTF8 bytes and excludes payload, filter values and credentials; config is read once', () => {
  const h = harness(); h.set({ body: '[]' });
  h.client.upsertRows('bundle', [{ content: 'Đông Bắc 😀' }], 'id');
  h.client.readRows('bundle', { email: 'eq.private@example.test' });
  const start = JSON.parse(h.logs.find((x) => x.startsWith('rpc_start:')).slice('rpc_start:'.length));
  assert.equal(start.requestBytes, Buffer.byteLength(h.calls[0].options.payload));
  assert.equal(h.calls[0].options.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(h.reads.filter((k) => k === 'SUPABASE_SERVICE_ROLE_KEY').length, 1);
  assert.doesNotMatch(h.logs.join('\n'), /Đông|Bắc|private@|fake-secret|isolated\.test/);
});

test('property persistence failure keeps the original quota and an in-memory guard', () => {
  const h = harness(); h.persistFailure(); h.set({ error: 'Bandwidth quota exceeded' });
  assert.throws(() => h.client.callRpc('claim', {}), /Bandwidth quota exceeded/);
  assert.throws(() => h.client.callRpc('claim', {}), /cooldown/);
  assert.equal(h.calls.length, 1); assert.match(h.logs.join('\n'), /rpc_cooldown_persist_failed/);
});

test('ambiguous write claim defers without execution, failure marking or another claim', () => {
  const h = harness(); h.set({ error: 'Bandwidth quota exceeded' });
  let executed = 0, persisted = 0;
  const r = h.s.WriteJobWorker.process(5, { isEnabled: () => true, createUuid: () => 'fake-worker',
    claimJobs: (payload) => h.client.callRpc('claim_write_jobs', payload), deferredError: h.client.deferredResult,
    executeJob: () => { executed++; }, repository: { markProcessing: () => { persisted++; }, markFailure: () => { persisted++; } } });
  assert.equal(r.ok, false); assert.equal(r.phase, 'claim'); assert.equal(r.claimOutcome, 'unknown');
  assert.equal(executed, 0); assert.equal(persisted, 0); assert.equal(h.calls.length, 1);
});
