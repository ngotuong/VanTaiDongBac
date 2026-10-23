const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function harness({ full = true, months = [], failDiscovery = false } = {}) {
  let now = 1000000;
  const props = new Map(); const scratch = new Map(); const calls = []; let failStage = ''; let slow = false;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const context = { nowMillis: () => now, nowISOString: () => new Date(now).toISOString(), normalizeYearMonthKey: String,
    withLock: (fn) => fn(), getProperty: (k) => props.get(k), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k),
    propertyKey: 'SUPABASE_PENDING_FUND_SYNC_2026' };
  const record = (name, month = '') => {
    calls.push([name, month]); if (`${name}:${month}` === failStage) throw Error('cache unavailable');
    now += slow ? 61000 : 16000; return { ok: true };
  };
  const fundSync = {
    syncAllFundBundles: () => { throw Error('Unbounded full batch forbidden'); },
    syncFundOverview: (year, month) => record('overview', month),
    syncFundTransactions: (_year, options) => record('transactions', options.month || ''), syncFundTransactionMonth: (year, month) => record('transactions', month),
    syncFundLoanOverview: (year, month) => record('loans', month),
    syncFundFormOptionsBundle: () => record('options'), syncFundCatalogBundle: (year, group) => record('catalog', group),
    getFundWriteMonthKeys: () => months,
    normalizeFundMonthKey: String
  };
  const sandbox = vm.createContext({ Date: ClockDate, console: { log() {} }, normalizeCleanValue_: (s) => String(s ?? '').trim(),
    APP_CONFIG: { spreadsheetId: 'isolated', year: '2026' },
    PropertiesService: { getScriptProperties: () => context },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-10', getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algo, value) => Array.from(crypto.createHash('sha256').update(value).digest()) },
    CacheService: { getScriptCache: () => ({ getAll: (keys) => Object.fromEntries(keys.filter((key) => scratch.has(key)).map((key) => [key, scratch.get(key)])), putAll: (values) => Object.entries(values).forEach(([k, v]) => scratch.set(k, v)) }) },
    SupabaseSyncStatusRepository: { upsert() {} }, FundSyncService: fundSync,
    FundTransactionService: { finishCapture: () => ({ ok: true }) },
    FundService: { readTransactionSourcePage: () => { now += slow ? 61000 : 16000; return { headers: [], columns: {}, displayValues: [], rawDateValues: [], lastRow: 1, nextRow: 0 }; }, beginTransactionCapture: () => ({}), appendTransactionCapture() {}, readOverviewSourcePage: (_year, part) => { now += 16000; return { rows: part === 'settings' ? {} : [], nextRow: 0 }; }, getFundOverviewFromSnapshot: () => { if (failDiscovery) throw Error('source unavailable'); return { ok: true, months: [{ key: '2026-10' }, { key: '2026-09' }] }; } }
  });
  for (const file of ['SheetChangeSignalService.gs', 'TransportSourceProbeService.gs', 'FundOverviewSnapshotService.gs', 'FundTransactionSnapshotService.gs', 'ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'SupabaseService.gs']) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  const queue = sandbox.ManualReportRefreshQueueService;
  queue.enqueue({ full, months, includeAll: false }, context); now += 15001;
  for (const key of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_TRIP_NOTIFICATION_NEXT_AT', 'SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) props.set(key + '_2026', String(now + 3600000));
  return { service: sandbox.SupabaseService, queue, context, calls, props, advance: (ms) => { now += ms; },
    failure: (name) => { failStage = name; }, slow: (value) => { slow = value; },
    tick: () => { props.set('SUPABASE_REALTIME_FAIRNESS_2026', '0'); return sandbox.SupabaseService.syncRealtimeCache(); } };
}

test('actual Fund timer splits full year into cache stages and ACKs only after months and all catalogs', () => {
  const h = harness(); const first = h.tick();
  assert.equal(first.step, 'fundPending');
  assert.ok(h.calls.some(([name, month]) => name === 'transactions' && month === ''));
  assert.equal(h.calls.some(([name]) => name === 'overview'), false, 'lists publish before overview capture');
  assert.equal(first.acknowledgement.acknowledged, false);
  let result = first;
  for (let i = 0; i < 30 && !result.acknowledgement.acknowledged; i++) result = h.tick();
  assert.equal(result.acknowledgement.acknowledged, true);
  assert.equal(h.props.has('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'), false);
  for (const month of ['2026-09', '2026-10']) for (const name of ['overview', 'transactions', 'loans']) {
    assert.equal(h.calls.filter(([n, m]) => n === name && m === month).length, 1);
  }
  assert.equal(h.calls.filter(([n]) => n === 'catalog').length, 5);
});

test('slow Fund stage yields within one task; failed cursor resumes without losing a newer queued edit', () => {
  const h = harness({ full: false, months: ['2026-10'] }); h.slow(true);
  const slow = h.tick();
  assert.equal(slow.stages.at(-1).split(':')[0], 'fundTransactionsScan');
  assert.equal(slow.stages.length, 2, 'setup is free; a single slow native page ends the tick');
  h.slow(false);
  h.failure('loans:'); const failed = h.tick(); assert.equal(failed.ok, false);
  h.queue.enqueue({ months: ['2026-09'], includeAll: false }, h.context);
  h.failure(''); h.advance(30001);
  let result; for (let i = 0; i < 20; i++) { result = h.tick(); if (result.acknowledgement.acknowledged) break; }
  assert.equal(result.acknowledgement.acknowledged, true);
  assert.ok(JSON.parse(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026')).months.includes('2026-09'));
  assert.equal(h.calls.filter(([n, m]) => n === 'overview' && m === '').length, 1);
});

test('Fund source discovery failure retries its cursor and never ACKs an incomplete full year', () => {
  const h = harness({ failDiscovery: true }); let result;
  for (let i = 0; i < 20; i++) { result = h.tick(); if (!result.ok) break; }
  assert.equal(result.ok, false); assert.equal(result.stage, 'fundDiscover');
  assert.equal(result.acknowledgement.acknowledged, false);
  const pending = JSON.parse(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026_LEASE')).item;
  assert.deepEqual(pending.tasks[0], ['fundDiscover']);
  assert.equal(h.calls.some(([n, m]) => m === '2026-09'), false);
});

test('Fund hard-crash lease replays only the persisted cursor and rejects the expired owner', () => {
  const h = harness({ full: false, months: ['2026-10'] }); h.tick(); h.tick();
  const old = h.queue.claimDue(h.context).item;
  h.advance(420001); const current = h.queue.claimDue(h.context).item;
  assert.notEqual(current.leaseId, old.leaseId);
  assert.throws(() => h.queue.saveProgress(old, h.context), /ownership changed/);
  assert.deepEqual(current.tasks, old.tasks);
  h.queue.saveProgress(current, h.context, 0);
  let result; for (let i = 0; i < 20; i++) { result = h.tick(); if (result.acknowledgement.acknowledged) break; }
  assert.equal(result.acknowledgement.acknowledged, true);
});

test('Fund staged lease converts to the legacy full scope only after drain and durable backup', () => {
  const h = harness(); h.tick(); const owner = h.queue.claimDue(h.context).item;
  h.queue.saveProgress(owner, h.context);
  assert.throws(() => h.queue.prepareLegacyRollback(h.context), /still active/);
  h.advance(420001); const plan = h.queue.prepareLegacyRollback(h.context);
  let saved; h.context.isRuntimePaused = () => true; h.context.backup = (value) => { saved = JSON.parse(JSON.stringify(value)); };
  h.queue.prepareLegacyRollback(h.context, { apply: true, expectedPendingRaw: plan.snapshot.pendingRaw, expectedLeaseRaw: plan.snapshot.leaseRaw });
  assert.equal(saved.snapshot.leaseRaw, plan.snapshot.leaseRaw);
  assert.equal(h.props.has('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'), false);
  const legacy = JSON.parse(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026'));
  assert.equal(legacy.full, true); assert.equal(legacy.tasks, undefined);
});

test('a newer Fund edit republishes its lists before resuming a yielded source capture', () => {
  const h = harness(); let lease;
  for (let i = 0; i < 10; i++) {
    h.tick(); lease = JSON.parse(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'));
    if (lease.item.tasks[0][0] === 'fundCapture') break;
  }
  assert.equal(lease.checkpoint, true); assert.equal(lease.item.tasks[0][0], 'fundCapture');
  const before = h.calls.filter(([n, m]) => n === 'transactions' && m === '').length;
  h.queue.enqueue({ full: true, source: 'signal:fund:EDIT' }, h.context); h.advance(15001);
  const result = h.tick(); assert.equal(result.ok, true);
  assert.equal(h.calls.filter(([n, m]) => n === 'transactions' && m === '').length, before + 1);
  const updated = JSON.parse(h.props.get('SUPABASE_PENDING_FUND_SYNC_2026_LEASE'));
  assert.notEqual(updated.id, lease.id); assert.equal(updated.item.priorityRestarts, 1);
  assert.equal(h.calls.filter(([n]) => n === 'overview').length, 0, 'uncompleted capture cannot publish an overview');
});


test('Fund planner2 checkpoint upgrades to paged planner3 while preserving historical and full scope', () => {
  const h = harness(); const old = h.queue.claimDue(h.context).item;
  h.queue.saveProgress({ ...old, planVersion: 2, months: ['2026-05'], tasks: [['fundTransactions', '2026-05']], fundTransactionsCapture: { id: 'old' } }, h.context, 0);
  let r;
  for (let i = 0; i < 30; i++) { r = h.tick(); assert.equal(r.ok, true); if (r.acknowledgement.acknowledged) break; }
  assert.equal(r.acknowledgement.acknowledged, true); assert.equal(r.full, true);
  for (const name of ['overview', 'transactions', 'loans']) assert.ok(h.calls.some(([n, m]) => n === name && m === '2026-05'));
  assert.equal(h.calls.filter(([n]) => n === 'catalog').length, 5);
});
