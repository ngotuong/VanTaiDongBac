const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ failStatus = false } = {}) {
  const calls = [], events = [], logs = [], properties = new Map();
  const props = { getProperty: (k) => properties.get(k), setProperty: (k, v) => properties.set(k, v), deleteProperty: (k) => { events.push(`delete:${k}`); properties.delete(k); } };
  const context = vm.createContext({ console: { log: (line) => logs.push(line) },
    normalizeCleanValue_: (v) => String(v ?? '').trim(), APP_CONFIG: { spreadsheetId: 'isolated', timezone: 'Asia/Ho_Chi_Minh' },
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => 'isolated-owner', formatDate: () => '2026-10' },
    CacheService: { getScriptCache: () => ({}) },
    SupabaseHttpClient: { getCooldown: () => ({ active: false }), upsertRows: (table, rows, conflict) => {
      events.push(`publish:${table}`); calls.push(plain({ table, rows, conflict }));
      if (failStatus && table === 'sync_status') throw Error('isolated transport failure');
    } },
    ManualReportRefreshQueueService: {
      getPending: () => null,
      claimNextDue: () => ({ due: true, key: 'transport', nextPreferredKey: 'fund', claims: {}, item: { sheets: ['NL_Dau'], sources: [] } }),
      claimDue: () => ({ due: false })
    },
    ManageSyncService: { syncManageDataBundle: (sheet, c) => {
      c.writeSyncStatus(`manage_data:${sheet}:recent_500`, 'manage', 'ok', 'cache published', '2026-10-09T13:00:00Z');
      return { ok: true };
    } },
    TransportSourceProbeService: { eligible: () => false },
    TransportRefreshWorker: { run: (_item, c) => {
      c.syncManage('NL_Dau'); c.syncManage('NL_TaiXe');
      c.writeStatus('ok', 'remaining=0'); events.push('business-ack');
      return { ok: true, acknowledgement: { acknowledged: true } };
    } }
  });
  vm.runInContext(fs.readFileSync('SupabaseSyncStatusRepository.gs', 'utf8'), context);
  vm.runInContext(fs.readFileSync('SupabaseService.gs', 'utf8'), context);
  for (const k of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) properties.set(k, String(Date.now() + 86400000));
  return { repo: context.SupabaseSyncStatusRepository, service: context.SupabaseService, context, calls, events, logs, properties };
}
const status = (key, value = 'ok') => ({ sync_key: key, module: 'manage', status: value, message: 'isolated', synced_at: '2026-10-09T13:00:00Z' });

test('a realtime turn publishes all stage statuses in one request before releasing its owner', () => {
  const h = harness(); const r = h.service.syncRealtimeCache();
  assert.equal(r.ok, true); assert.equal(r.acknowledgement.acknowledged, true);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].table, 'sync_status');
  assert.deepEqual(h.calls[0].rows.map((x) => x.sync_key), ['manage_data:NL_Dau:recent_500', 'manage_data:NL_TaiXe:recent_500', 'transport_reports_manual_sheet']);
  assert.equal(h.calls[0].rows[0].synced_at, '2026-10-09T13:00:00Z');
  assert.ok(h.events.indexOf('publish:sync_status') < h.events.indexOf('delete:SUPABASE_REALTIME_TICK_RUNNING'));
  assert.equal(h.properties.has('SUPABASE_REALTIME_TICK_RUNNING'), false);
});

test('duplicate status keys retain the last row, while unrelated keys and timestamps remain intact', () => {
  const h = harness(); const other = status('other'); const last = { ...status('same', 'error'), message: 'failed stage', synced_at: '2026-10-09T13:01:00Z' };
  const result = h.repo.withBatch(() => { h.repo.upsert(status('same')); h.repo.upsert(other); h.repo.upsert(last); return 'result'; });
  assert.equal(result, 'result'); assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].rows, [last, other]); assert.equal(h.calls[0].conflict, 'sync_key');
});

test('nested work shares the enclosing batch and flushes successful/error statuses on an exception', () => {
  const h = harness(); const original = Error('source read failed');
  assert.throws(() => h.repo.withBatch(() => { h.repo.upsert(status('first')); h.repo.withBatch(() => h.repo.upsert(status('failed', 'error'))); throw original; }), (e) => e === original);
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].rows.map((x) => x.status), ['ok', 'error']);
  h.repo.upsert(status('standalone')); assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1].rows, [status('standalone')]);
});

test('failed status transport never masks a business exception and cannot leak buffered rows into the next call', () => {
  const h = harness({ failStatus: true }); const original = Error('business failure');
  assert.throws(() => h.repo.withBatch(() => { h.repo.upsert(status('old')); throw original; }), (e) => e === original);
  h.repo.withBatch(() => h.repo.upsert(status('new')));
  assert.deepEqual(h.calls.map((x) => x.rows.map((r) => r.sync_key)), [['old'], ['new']]);
  assert.equal(h.logs.length, 2); assert.ok(h.logs.every((x) => x.startsWith('sync_status_batch_failed:')));
});

test('status failure after a realtime ACK does not replay business work or leave the realtime lease held', () => {
  const h = harness({ failStatus: true }); const r = h.service.syncRealtimeCache();
  assert.equal(r.ok, true); assert.equal(r.acknowledgement.acknowledged, true);
  assert.equal(h.events.filter((x) => x === 'business-ack').length, 1);
  assert.equal(h.calls.length, 1); assert.equal(h.properties.has('SUPABASE_REALTIME_TICK_RUNNING'), false);
  assert.equal(h.logs.length, 1);
});

test('paused/overlapping ticks publish no batch and preserve another owner', () => {
  const h = harness(); const owner = JSON.stringify({ token: 'other', expiresAt: Date.now() + 60000 });
  h.properties.set('SUPABASE_REALTIME_TICK_RUNNING', owner);
  assert.equal(h.service.syncRealtimeCache().skipped, true);
  assert.equal(h.calls.length, 0); assert.equal(h.properties.get('SUPABASE_REALTIME_TICK_RUNNING'), owner);
  h.properties.set('REPORT_CACHE_E1_PARITY_RUNNING', 'true');
  assert.equal(h.service.syncRealtimeCache().skipped, true); assert.equal(h.calls.length, 0);
});

test('empty batches send no HTTP request; standalone publication remains immediate', () => {
  const h = harness(); h.repo.withBatch(() => {}); assert.equal(h.calls.length, 0);
  h.repo.upsert(status('direct')); assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].rows, [status('direct')]);
});

test('a due watchdog heartbeat publishes before business stages, separately from the status batch', () => {
  const h = harness(); h.properties.delete('SUPABASE_REALTIME_HEARTBEAT_NEXT_AT');
  assert.equal(h.service.syncRealtimeCache().ok, true);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0].rows.map((x) => x.sync_key), ['realtime_cache_worker']);
  assert.equal(h.calls[1].rows.length, 3);
  assert.ok(h.events.indexOf('publish:sync_status') < h.events.indexOf('business-ack'));
});
