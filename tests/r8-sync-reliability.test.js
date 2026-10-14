const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const read = (name) => fs.readFileSync(name, 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
function load(...files) { const s = vm.createContext({}); for (const f of files) vm.runInContext(read(f), s); return s; }

test('signal drain keeps a later event racing enqueue/consumption, and a failed enqueue remains unconsumed', () => {
  const service = load('SheetChangeSignalService.gs').SheetChangeSignalService;
  const p = new Map(); let seq = 0; let enqueues = 0;
  const ctx = { getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), nowMillis: () => 1000, createUuid: () => String(++seq) };
  p.set('SUPABASE_SHEET_TRIGGER_BINDINGS_V1', JSON.stringify({ e: { handler: 'handleTransportSheetEdit', spreadsheetId: 'sheet' } }));
  const event = () => service.record({ triggerUid: 'e' }, 'transport', 'handleTransportSheetEdit', 'sheet', ctx);
  event(); ctx.enqueue = () => { enqueues++; if (enqueues === 1) event(); return { queued: true }; };
  service.drain('transport', ctx); service.drain('transport', ctx); service.drain('transport', ctx);
  assert.equal(enqueues, 2); assert.ok(p.has('SUPABASE_SHEET_SIGNAL_TRANSPORT'));
  event(); ctx.enqueue = () => ({ deferred: true });
  assert.throws(() => service.drain('transport', ctx), /enqueue failed/);
  assert.notEqual(p.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_CONSUMED'), JSON.parse(p.get('SUPABASE_SHEET_SIGNAL_TRANSPORT')).token);
});

test('edit signals retain and coalesce bounded sheet row scopes until the durable ACK', () => {
  const service = load('SheetChangeSignalService.gs').SheetChangeSignalService;
  const p = new Map(); let seq = 0; let drained;
  const ctx = { getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), nowMillis: () => 1000, createUuid: () => String(++seq) };
  p.set('SUPABASE_SHEET_TRIGGER_BINDINGS_V1', JSON.stringify({ e: { handler: 'handleFundSheetEdit', spreadsheetId: 'fund' } }));
  const event = (row) => ({ triggerUid: 'e', range: {
    getSheet: () => ({ getName: () => 'NHAP_THUCHI' }), getRow: () => row, getNumRows: () => 1
  } });
  service.record(event(877), 'fund', 'handleFundSheetEdit', 'fund', ctx);
  service.record(event(878), 'fund', 'handleFundSheetEdit', 'fund', ctx);
  const pending = JSON.parse(p.get('SUPABASE_SHEET_SIGNAL_FUND'));
  assert.deepEqual(plain(pending.scopes), [
    { sheetName: 'NHAP_THUCHI', startRow: 877, numRows: 1 },
    { sheetName: 'NHAP_THUCHI', startRow: 878, numRows: 1 }
  ]);
  ctx.enqueue = (signal) => { drained = plain(signal); return { queued: true }; };
  service.drain('fund', ctx);
  assert.deepEqual(drained.scopes, pending.scopes);
  service.record(event(900), 'fund', 'handleFundSheetEdit', 'fund', ctx);
  assert.deepEqual(plain(JSON.parse(p.get('SUPABASE_SHEET_SIGNAL_FUND')).scopes), [
    { sheetName: 'NHAP_THUCHI', startRow: 900, numRows: 1 }
  ]);
});

test('owner binding registration rejects foreign workbooks and wrong event types without replacing prior bindings', () => {
  const service = load('SheetChangeSignalService.gs').SheetChangeSignalService;
  let saved = 'baseline'; const context = { handlers: { edit: { spreadsheetId: 'sheet', eventType: 'ON_EDIT' } }, setProperty: (_k, v) => { saved = v; } };
  const trigger = (sheet, type = 'ON_EDIT') => ({ getHandlerFunction: () => 'edit', getTriggerSourceId: () => sheet, getEventType: () => type, getUniqueId: () => 'u' });
  assert.throws(() => service.register([trigger('foreign')], context), /mismatch/);
  assert.throws(() => service.register([trigger('sheet', 'ON_CHANGE')], context), /mismatch/);
  assert.throws(() => service.register([], context), /missing/); assert.equal(saved, 'baseline');
  assert.equal(service.register([trigger('sheet')], context).registered, 1);
  assert.equal(JSON.parse(saved).u.spreadsheetId, 'sheet');
});

function probeHarness() {
  const s = load('ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'TransportSourceProbeService.gs');
  const p = new Map(); const hashes = { NL_Dau: 'fuel-a', DM_Xe: 'vehicles-a' }; const missing = new Set(); const calls = []; let now = 1000000; let fail = false;
  const c = { nowMillis: () => now, nowISOString: () => new Date(now).toISOString(), normalizeYearMonthKey: String,
    getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), deleteProperty: (k) => p.delete(k), withLock: (fn) => fn() };
  const q = s.ManualReportRefreshQueueService;
  const sources = [{ sheet: 'NL_Dau', kind: 'manage' }, { sheet: 'DM_Xe', kind: 'catalog' }];
  const w = { nowMillis: c.nowMillis, log() {}, writeStatus() {}, catalogForms: ['vanChuyen'],
    saveProgress: (item, delay) => q.saveProgress(item, c, delay), requeue: (item) => q.requeue(item, c), acknowledge: (item) => q.acknowledge(item, c),
    buildTasks: (item) => s.TransportSourceProbeService.tasks(item, sources),
    runTask: (task, item) => s.TransportSourceProbeService.run(task, item, { ...c, cachePresent: (task) => !missing.has(task[1]), safetyCatalogTasks: () => [['catalogOptions', 'vanChuyen'], ['startup']], commit: (fn) => q.withOwnedLease(item, c, fn), readHash: (sheet) => hashes[sheet], buildCacheTasks: (scope) => s.TransportRefreshWorker.buildCacheTasks(scope, w) }),
    manageMonths: () => ['2026-09', '2026-10'], reportMonths: () => ['2026-09', '2026-10'],
    syncManage: (name) => { calls.push(name); return { ok: true }; }, syncManageMonth: () => ({ ok: true }), syncDashboard: () => ({ ok: true }),
    syncReport: () => { if (fail) throw Error('timeout'); return { ok: true }; },
    syncCatalog: (name) => { calls.push(name); return { ok: true }; }, syncCatalogOptions: () => ({ ok: true }), syncStartup: () => ({ ok: true }) };
  const enqueue = (source = 'signal:transport:EDIT') => { q.enqueue({ full: true, sheets: ['NL_Dau'], catalogs: ['DM_Xe'], source }, c); now += 15001; };
  const tick = () => { const claim = q.claimDue(c); return claim.due ? s.TransportRefreshWorker.run(claim.item, w) : null; };
  const finish = () => { let result; for (let i = 0; i < 40; i++) { result = tick(); if (!result || !result.ok || result.acknowledgement.acknowledged) return result; } throw Error('did not finish'); };
  return { p, q, c, sources, hashes, missing, calls, enqueue, tick, finish, fail: (v) => { fail = v; }, advance: (ms) => { now += ms; } };
}

test('probes refresh only changed inputs and commit fingerprints after caches; an unchanged FORMAT needs no refresh', () => {
  const h = probeHarness(); h.enqueue(); assert.equal(h.finish().acknowledgement.acknowledged, true);
  assert.deepEqual(h.calls, ['NL_Dau', 'DM_Xe']); h.calls.length = 0;
  h.enqueue(); assert.equal(h.finish().acknowledgement.acknowledged, true); assert.deepEqual(h.calls, []);
  h.hashes.NL_Dau = 'fuel-b'; h.enqueue(); h.fail(true);
  const failed = h.finish(); assert.equal(failed.ok, false);
  assert.equal(h.p.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau'), 'fuel-a');
  assert.equal(h.p.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_DM_Xe'), 'vehicles-a');
  h.fail(false); h.advance(30001); assert.equal(h.finish().acknowledgement.acknowledged, true);
  assert.equal(h.p.get('SUPABASE_TRANSPORT_INPUT_HASH_V1_NL_Dau'), 'fuel-b');
  assert.deepEqual(h.calls, ['NL_Dau']);
});

test('rollback of an interrupted probe preserves all source scope before removing new task types', () => {
  const h = probeHarness(); h.enqueue(); h.tick(); const owner = h.q.claimDue(h.c).item;
  h.q.saveProgress(owner, h.c); h.advance(420001);
  const plan = h.q.prepareLegacyRollback(h.c);
  assert.deepEqual(plain(plan.manageSheetsToRefresh), ['NL_Dau']); assert.deepEqual(plain(plan.catalogsToRefresh), ['DM_Xe']);
  assert.equal(plan.pending.full, true); assert.equal(plan.pending.tasks, undefined);
  const staged = h.q.prepareLegacyRollback(h.c, { targetRuntime: 'staged401' });
  assert.deepEqual(plain(staged.pending.sheets), ['NL_Dau']);
  assert.deepEqual(plain(staged.pending.catalogs), ['DM_Xe']);
  assert.equal(staged.pending.tasks, undefined); assert.equal(staged.pending.inputHashes, undefined);
});

test('an expired probe owner cannot commit source hashes after another worker claims its cursor', () => {
  const h = probeHarness(); h.enqueue(); h.tick();
  const old = h.q.claimDue(h.c).item; h.advance(420001);
  const current = h.q.claimDue(h.c).item; let committed = false;
  assert.notEqual(current.leaseId, old.leaseId);
  assert.throws(() => h.q.withOwnedLease(old, h.c, () => { committed = true; }), /ownership/);
  assert.equal(committed, false);
  h.q.withOwnedLease(current, h.c, () => { committed = true; }); assert.equal(committed, true);
});

test('unchanged-source safety repairs missing manage/catalog caches and refreshes time-dependent report scope', () => {
  const h = probeHarness(); h.enqueue(); h.finish(); h.calls.length = 0;
  h.missing.add('NL_Dau'); h.missing.add('DM_Xe'); h.enqueue();
  assert.equal(h.finish().acknowledgement.acknowledged, true); assert.deepEqual(h.calls, ['NL_Dau', 'DM_Xe']);
  h.missing.clear(); h.calls.length = 0; h.fail(true); h.enqueue('safety:transport');
  const result = h.finish(); assert.equal(result.ok, false); assert.match(result.stage, /^report:/);
  assert.deepEqual(h.calls, []);
});

function captureHarness() {
  const service = load('FundOverviewSnapshotService.gs').FundOverviewSnapshotService;
  const scratch = new Map(); let stamp = 'v1'; let id = 0;
  const calls = [];
  const ctx = { uuid: () => String(++id), stamp: () => stamp, hash: (v) => crypto.createHash('sha256').update(v).digest('hex'),
    cache: { putAll: (values) => Object.entries(values).forEach(([k, v]) => { assert.ok(Buffer.byteLength(v) < 100000); scratch.set(k, v); }), getAll: (keys) => Object.fromEntries(keys.filter((k) => scratch.has(k)).map((k) => [k, scratch.get(k)])) },
    read: (part, row, limit) => { calls.push([part, row, limit]); return { rows: part === 'settings' ? { cashOpening: 100, loanStartDate: new Date('2026-01-01T00:00:00Z') } : [{ rowIndex: row, dateObj: new Date('2026-09-01T00:00:00Z'), amount: row, content: '東'.repeat(20000) }], nextRow: part === 'transactions' && row === 2 ? 202 : 0 }; } };
  const item = {};
  const capture = () => { let task = service.start(item, ctx); while (task) task = service.run(task, item, ctx).added[0]; };
  return { service, scratch, ctx, item, calls, capture, change: () => { stamp = 'v2'; } };
}

test('Fund capture reads bounded pages, survives durable cursor serialization and restores dates without money changes', () => {
  const h = captureHarness(); h.capture(); const snapshot = h.service.load(plain(h.item), h.ctx);
  assert.deepEqual(h.calls, [['transactions', 2, 200], ['transactions', 202, 200], ['loans', 2, 200], ['settings', 2, 200]]);
  assert.equal(snapshot.transactions[1].rowIndex, 202); assert.equal(snapshot.transactions[1].amount, 202);
  assert.equal(snapshot.transactions[0].dateObj.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(snapshot.settings.loanStartDate.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.ok(JSON.stringify(h.item).length < 2000);
});

test('Fund cache eviction, corrupted chunks and source edits cannot produce a completed snapshot', () => {
  const h = captureHarness(); h.capture(); const key = h.scratch.keys().next().value;
  h.scratch.set(key, 'corrupt'); assert.equal(h.service.load(h.item, h.ctx), null);
  h.capture(); h.scratch.clear(); assert.equal(h.service.load(h.item, h.ctx), null);
  h.capture(); h.change(); assert.equal(h.service.load(h.item, h.ctx), null);
  const result = h.service.run(['fundCapture', 'settings', 2], h.item, h.ctx);
  assert.deepEqual(plain(result.added), [['fundCapture', 'transactions', 2]]); assert.equal(h.item.fundCapture.ready, false);
});

function timerHarness() {
  let now = 1000000; const p = new Map(); const notifications = []; const queued = [];
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const sandbox = vm.createContext({ Date: ClockDate, console: { log() {} }, normalizeCleanValue_: (v) => String(v ?? '').trim(),
    APP_CONFIG: { spreadsheetId: 'sheet' }, PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), deleteProperty: (k) => p.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) }, Utilities: { getUuid: () => crypto.randomUUID() },
    SupabaseSyncStatusRepository: { upsert() {} },
    // Preserve a sustained backlog without executing its native work in this scheduler test.
    ManualReportRefreshQueueService: { enqueue: (scope) => { queued.push(plain(scope)); return { queued: true }; }, getPending: () => ({}), claimNextDue: () => ({ claims: { transport: { pending: true }, fund: { pending: true } } }) },
    NotificationPipelineService: { run: (ctx) => { if (Number(ctx.getProperty(ctx.nextAtKey) || 0) > now) return { checked: false };
      notifications.push(now); ctx.setProperty(ctx.nextAtKey, String(now + ctx.intervalMs)); return { checked: true, ok: true }; } },
    SpreadsheetApp: { openById: () => { throw Error('Unbounded legacy sweep must never run'); } }
  });
  vm.runInContext(read('SupabaseService.gs'), sandbox);
  for (const key of ['SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) p.set(key, String(now + 86400000));
  return { p, queued, notifications, service: sandbox.SupabaseService, tick: () => sandbox.SupabaseService.syncRealtimeCache(), advance: (ms) => { now += ms; } };
}

test('hourly safety enqueues all Transport and Fund scopes in durable queues, including during sustained work', () => {
  const h = timerHarness(); h.tick(); assert.equal(h.queued.length, 2);
  const transport = h.queued.find((s) => s.source === 'safety:transport');
  assert.equal(transport.sheets.length, 8); assert.ok(transport.sheets.includes('NL_Dau')); assert.equal(transport.catalogs.length, 13);
  assert.ok(h.queued.find((s) => s.source === 'safety:fund').full);
  h.advance(3599999); h.tick(); assert.equal(h.queued.length, 2);
  h.advance(1); h.tick(); assert.equal(h.queued.length, 4);
});

test('notification due work is checked on each reserved turn under backlog, without a three-family 12-minute wait', () => {
  const h = timerHarness(); for (let i = 0; i < 30; i++) { h.tick(); h.advance(60000); }
  assert.ok(h.notifications.length >= 4);
  for (let i = 1; i < h.notifications.length; i++) assert.ok(h.notifications[i] - h.notifications[i - 1] <= 8 * 60000);
  assert.ok(Number(h.p.get('SUPABASE_REALTIME_HEARTBEAT_NEXT_AT')) > 0);
});
