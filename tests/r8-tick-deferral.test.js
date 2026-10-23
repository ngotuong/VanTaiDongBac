const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function harness({ sourceCost = 30000, failSource = '', failLock = false } = {}) {
  let now = 1000000; const p = new Map(); const sources = [], enqueues = [], logs = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const props = { getProperty: (k) => p.get(k), setProperty: (k, v) => p.set(k, v), deleteProperty: (k) => p.delete(k) };
  const s = vm.createContext({ Date: Clock, console: { log: (x) => logs.push(x) }, normalizeCleanValue_: (x) => String(x ?? '').trim(), APP_CONFIG: { spreadsheetId: 'isolated', year: '2026', timezone: 'Asia/Ho_Chi_Minh' },
    PropertiesService: { getScriptProperties: () => props }, LockService: { getScriptLock: () => ({ tryLock: () => { if (failLock) throw Error('A server error occurred while reading from storage. Error code INTERNAL.'); return true; }, releaseLock() {}, waitLock() {} }) },
    Utilities: { formatDate: () => '2026-10', getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_algo, text) => [...crypto.createHash('sha256').update(text).digest()] },
    CacheService: { getScriptCache: () => ({}) },
    ManageSyncService: { isManageSheetName: (name) => name.startsWith('NL_'), syncManageDataBundle: () => ({ ok: true }) },
    SupabaseSyncStatusRepository: { upsert() {} }, NotificationPipelineService: { run: () => ({ checked: false }) },
    FundService: { resolveFundSpreadsheetId: () => 'fund' },
    ManualReportRefreshQueueService: { getPending: () => null, claimNextDue: () => ({ claims: {} }), enqueue: (scope) => { enqueues.push(scope.source); if (scope.source === failSource) throw Error('queue unavailable'); return { queued: true }; } },
    SpreadsheetApp: { openById: () => ({
      getSheets: () => [{ getSheetId: () => 731, getName: () => 'NL_Dau' }],
      getSheetByName: (name) => { sources.push(name); now += sourceCost; return { getLastRow: () => 1, getLastColumn: () => 14 }; }
    }) } });
  for (const f of ['SheetChangeSignalService.gs', 'SourceFingerprintService.gs', 'TransportSourceProbeService.gs', 'TransportRefreshWorker.gs', 'SupabaseService.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), s);
  for (const key of ['SUPABASE_REALTIME_HEARTBEAT_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT']) p.set(key + '_2026', '999999999');
  p.set('SUPABASE_REALTIME_FAIRNESS_2026', '3'); p.set('SUPABASE_REALTIME_HOUSEKEEPING_INDEX_2026', '1');
  return { s, props, p, sources, enqueues, logs, tick: () => s.SupabaseService.syncRealtimeCache(), advance: (ms) => { now += ms; } };
}

test('source polling saves its cursor between expensive sources and completes interval only after all six', () => {
  const h = harness(); const first = h.tick(); assert.equal(first.result.continuing, true);
  assert.deepEqual(h.sources, ['NL_VanChuyen', 'NL_Dau']); assert.equal(h.p.get('SUPABASE_SOURCE_POLL_CURSOR_V1_2026'), '2');
  assert.equal(h.p.get('SUPABASE_SOURCE_POLL_NEXT_AT_2026'), undefined);
  h.advance(60000); h.tick(); h.advance(60000); h.tick();
  assert.deepEqual(h.sources, ['NL_VanChuyen', 'NL_Dau', 'DM_LichSuNhanSu', 'SYS_AggThuongTuyen', 'NHAP_THUCHI', 'NHAP_VAY']);
  assert.equal(h.p.has('SUPABASE_SOURCE_POLL_CURSOR_V1_2026'), false);
  assert.ok(Number(h.p.get('SUPABASE_SOURCE_POLL_NEXT_AT_2026')) > 1000000);
  assert.ok(h.enqueues.includes('poll:fund-downstream'));
});

test('failed enqueue leaves fingerprint uncommitted and retries the same source', () => {
  const h = harness({ sourceCost: 1000, failSource: 'poll:fuel' }); const first = h.tick();
  assert.equal(first.ok, false); assert.equal(h.p.get('SUPABASE_SOURCE_POLL_CURSOR_V1_2026'), '1');
  assert.equal(h.p.has('SUPABASE_SOURCE_FINGERPRINT_FUEL_2026'), false);
  h.advance(60000); h.tick(); assert.equal(h.sources.filter((s) => s === 'NL_VanChuyen').length, 1);
  assert.equal(h.sources.filter((s) => s === 'NL_Dau').length, 2);
});

test('timer resolves trigger grid id to the exact sheet before durable enqueue', () => {
  const h = harness({ sourceCost: 1000 });
  h.p.set('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026', JSON.stringify({ token: 'signal-1', eventType: 'EDIT', scopes: [{ gridId: 731, startRow: 25, numRows: 1 }] }));
  h.tick();
  assert.ok(h.enqueues.includes('sheet:NL_Dau:EDIT'));
  assert.equal(h.p.get('SUPABASE_SHEET_SIGNAL_TRANSPORT_2026_CONSUMED'), 'signal-1');
});

test('Google lock admission failure defers without starting source work or clearing another lease', () => {
  const h = harness({ failLock: true }); h.p.set('SUPABASE_REALTIME_TICK_RUNNING_2026', '{"token":"other-owner","expiresAt":99999999}');
  const r = h.tick(); assert.equal(r.ok, false); assert.equal(r.deferred, true);
  assert.equal(h.sources.length, 0); assert.match(h.p.get('SUPABASE_REALTIME_TICK_RUNNING_2026'), /other-owner/);
});

test('loading the service does not read properties for optional Fund feature flags', () => {
  let reads = 0; const s = vm.createContext({ PropertiesService: { getScriptProperties: () => { reads++; throw Error('storage unavailable'); } } });
  vm.runInContext(fs.readFileSync('SupabaseService.gs', 'utf8'), s); assert.equal(reads, 0);
});


test('writer pause-property read failure fails closed before claim or Sheet work', () => {
  let claimed = 0;
  const s = vm.createContext({ console: { log() {} }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => { throw Error('A server error occurred. Error code INTERNAL.'); } }) },
    EntryService: { releaseWriteJobReservation() {} }, WriteJobRepository: {}, SupabaseHttpClient: { callRpc: () => { claimed++; }, deferredResult: () => null } });
  for (const f of ['WriteJobWorker.gs', 'SupabaseService.gs']) vm.runInContext(fs.readFileSync(f, 'utf8'), s);
  const r = s.SupabaseService.processWriteJobs(5); assert.equal(r.ok, false); assert.equal(r.deferred, true);
  assert.equal(r.phase, 'admission'); assert.equal(claimed, 0);
});

test('sheet event storage outage is deferred without a trigger failure email', () => {
  const s = vm.createContext({ console: { log() {} }, normalizeCleanValue_: (x) => String(x ?? '').trim(),
    APP_CONFIG: { spreadsheetId: 'isolated', year: '2026', timezone: 'Asia/Ho_Chi_Minh' }, DEFAULT_FUND_SPREADSHEET_ID: 'fund',
    PropertiesService: { getScriptProperties: () => { throw Error('A server error occurred. Error code INTERNAL.'); } },
    SheetChangeSignalService: { record: () => { throw Error('must not reach record'); } } });
  vm.runInContext(fs.readFileSync('SupabaseService.gs', 'utf8'), s);
  const result = s.SupabaseService.handleTransportSheetEdit({ triggerUid: 'edit' });
  assert.equal(result.ok, false); assert.equal(result.deferred, true); assert.equal(result.category, 'google_platform');
  const structural = s.SupabaseService.handleTransportSheetChange({ triggerUid: 'change', changeType: 'INSERT_GRID' });
  assert.equal(structural.ok, false); assert.equal(structural.deferred, true); assert.equal(structural.category, 'google_platform');
});


test('a successful worker refresh retains a failed housekeeping result in the combined tick', () => {
  const h = harness({ sourceCost: 1000, failSource: 'poll:fuel' });
  const q = h.s.ManualReportRefreshQueueService;
  q.claimNextDue = () => ({ due: true, key: 'transport', nextPreferredKey: 'fund', claims: {}, item: { full: false, months: ['2026-10'], tasks: [['manage', 'NL_Dau']], planVersion: 3, skipVerification: true } });
  q.saveProgress = () => ({}); q.acknowledge = () => ({ acknowledged: true }); q.claimDue = () => ({ due: false });
  const r = h.tick(); assert.equal(r.stage, 'manage:NL_Dau'); assert.equal(r.acknowledgement.acknowledged, true);
  assert.equal(r.ok, false); assert.equal(r.housekeeping.result.source, 'fuel');
});
