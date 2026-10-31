const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadQueue() {
  const vmContext = vm.createContext({});
  new vm.Script(read('ManualReportRefreshQueueService.gs'), { filename: 'ManualReportRefreshQueueService.gs#test' }).runInContext(vmContext);
  let now = Date.parse('2026-07-19T05:00:00.000Z');
  const values = {};
  const context = {
    debounceMs: 15000,
    retryDelayMs: 30000,
    nowMillis: () => now,
    nowISOString: () => new Date(now).toISOString(),
    normalizeYearMonthKey(value) {
      const text = String(value || '').trim();
      const iso = text.match(/^(\d{4})-(\d{1,2})/);
      if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
      const vn = text.match(/^(\d{1,2})\/(\d{4})$/);
      return vn ? `${vn[2]}-${String(Number(vn[1])).padStart(2, '0')}` : '';
    },
    getProperty: (key) => values[key] || null,
    setProperty: (key, value) => { values[key] = value; },
    deleteProperty: (key) => { delete values[key]; },
    withLock: (fn) => fn()
  };
  return {
    service: vmContext.ManualReportRefreshQueueService,
    context,
    values,
    advance(ms) { now += ms; }
  };
}

test('E1.6 queue debounces and merges affected months without duplicate rows of work', () => {
  const queue = loadQueue();
  const first = queue.service.enqueue({ months: ['07/2026'], source: 'edit:1' }, queue.context);
  assert.deepEqual(JSON.parse(JSON.stringify(first.months)), ['2026-07']);
  assert.equal(first.waitMs, 15000);

  queue.advance(5000);
  const merged = queue.service.enqueue({ months: ['2026-06', '2026-07'], source: 'edit:2' }, queue.context);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.months)), ['2026-06', '2026-07']);
  assert.equal(merged.waitMs, 15000);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.sources)), ['edit:1', 'edit:2']);

  const early = queue.service.claimDue(queue.context);
  assert.equal(early.due, false);
  assert.equal(early.pending, true);
  queue.advance(15000);
  const claimed = queue.service.claimDue(queue.context);
  assert.equal(claimed.due, true);
  assert.deepEqual(JSON.parse(JSON.stringify(claimed.item.months)), ['2026-06', '2026-07']);
  assert.equal(queue.service.getPending(queue.context).leased, true);
  assert.equal(queue.service.acknowledge(claimed.item, queue.context).acknowledged, true);
  assert.equal(queue.service.getPending(queue.context), null);
});

test('E1.6 structural changes supersede narrow months and failed claims retry safely', () => {
  const queue = loadQueue();
  queue.service.enqueue({ months: ['2026-07'], source: 'edit' }, queue.context);
  const full = queue.service.enqueue({ full: true, source: 'remove-row' }, queue.context);
  assert.equal(full.full, true);
  assert.deepEqual(JSON.parse(JSON.stringify(full.months)), []);

  queue.advance(15000);
  const claimed = queue.service.claimDue(queue.context);
  assert.equal(claimed.due, true);
  const retry = queue.service.requeue(claimed.item, queue.context);
  assert.equal(retry.full, true);
  assert.equal(retry.attempts, 1);
  assert.equal(retry.waitMs, 30000);
});

test('E1.6 formula verification survives queue merge and retry', () => {
  const queue = loadQueue();
  queue.service.enqueue({ months: ['2026-08'], source: 'catalog-edit', verificationPasses: 1 }, queue.context);
  const merged = queue.service.enqueue({ months: ['2026-08'], source: 'second-edit' }, queue.context);
  assert.equal(merged.verificationPasses, 1);
  queue.advance(15000);
  const claimed = queue.service.claimDue(queue.context);
  assert.equal(claimed.item.verificationPasses, 1);
  const retry = queue.service.requeue(claimed.item, queue.context);
  assert.equal(retry.verificationPasses, 1);
});

test('E1.6R queue supports an isolated property key for Fund refresh work', () => {
  const queue = loadQueue();
  queue.context.propertyKey = 'SUPABASE_PENDING_FUND_SYNC';
  queue.service.enqueue({ months: ['2026-07'], source: 'fund-sheet' }, queue.context);
  assert.equal(queue.values.SUPABASE_PENDING_TRANSPORT_REPORT_SYNC, undefined);
  assert.ok(queue.values.SUPABASE_PENDING_FUND_SYNC);
  queue.advance(15000);
  const claimed = queue.service.claimDue(queue.context);
  assert.equal(claimed.due, true);
  assert.deepEqual(JSON.parse(JSON.stringify(claimed.item.months)), ['2026-07']);
  assert.equal(queue.values.SUPABASE_PENDING_FUND_SYNC, undefined);
});

test('E1.6R queue coordinator claims only one due queue and preserves the other', () => {
  const queue = loadQueue();
  const fundContext = { ...queue.context, propertyKey: 'SUPABASE_PENDING_FUND_SYNC' };
  queue.service.enqueue({ months: ['2026-08'], source: 'transport-sheet' }, queue.context);
  queue.service.enqueue({ months: ['2026-08'], source: 'fund-sheet' }, fundContext);
  queue.advance(15000);

  const transportFirst = queue.service.claimNextDue([
    { key: 'transport', context: queue.context },
    { key: 'fund', context: fundContext }
  ], 'transport');
  assert.equal(transportFirst.key, 'transport');
  assert.equal(transportFirst.nextPreferredKey, 'fund');
  assert.equal(queue.service.getPending(queue.context).leased, true);
  assert.ok(queue.service.getPending(fundContext));

  const fundNext = queue.service.claimNextDue([
    { key: 'transport', context: queue.context },
    { key: 'fund', context: fundContext }
  ], transportFirst.nextPreferredKey);
  assert.equal(fundNext.key, 'fund');
  assert.equal(fundNext.nextPreferredKey, 'transport');
  assert.equal(queue.service.acknowledge(fundNext.item, fundContext).acknowledged, true);
  assert.equal(queue.service.getPending(fundContext), null);
  assert.equal(queue.service.acknowledge(transportFirst.item, queue.context).acknowledged, true);
});

test('R3 queue lease survives a crashed worker and is reclaimed after expiry', () => {
  const queue = loadQueue();
  queue.context.leaseMs = 60000;
  queue.service.enqueue({ months: ['2026-09'], source: 'sheet-edit' }, queue.context);
  queue.advance(15000);
  const first = queue.service.claimDue(queue.context);
  assert.equal(first.due, true);
  assert.equal(queue.service.claimDue(queue.context).due, false);
  assert.equal(queue.service.getPending(queue.context).leased, true);

  queue.advance(60001);
  const reclaimed = queue.service.claimDue(queue.context);
  assert.equal(reclaimed.due, true);
  assert.deepEqual(JSON.parse(JSON.stringify(reclaimed.item.months)), ['2026-09']);
  assert.equal(reclaimed.item.attempts, 1);
  assert.notEqual(reclaimed.item.leaseId, first.item.leaseId);
  assert.equal(queue.service.acknowledge(reclaimed.item, queue.context).acknowledged, true);
  assert.equal(queue.service.getPending(queue.context), null);
});

test('E1.6 Supabase facade processes refreshes through durable queues and refreshes Tất cả', () => {
  const source = read('SupabaseService.gs');
  const claimOffset = source.indexOf('ManualReportRefreshQueueService.claimNextDue');
  assert.ok(claimOffset > -1);
  assert.doesNotMatch(source, /buildRealtimeTickSteps_|runRealtimeTickStep_/);
  const worker = read('TransportRefreshWorker.gs');
  assert.match(worker, /step: context\.step \|\| 'transportReportsPending'/);
  assert.match(read('TransportRefreshWorker.gs'), /tasks\.push\(\['report', 'Tất cả'\]\)/);
  assert.match(source, /safeEventType !== 'EDIT' && safeEventType !== 'MANUAL_TEST'/);
  assert.match(source, /full: true,[\s\S]*source: 'sheet:unknown:'/);
  assert.match(source, /ManualReportRefreshQueueService\.requeue\(item, context\)/);
  assert.match(source, /ManualReportRefreshQueueService\.acknowledge\(item, context\)/);
  assert.match(worker, /unique_\(item\.months\)\.sort\(\)\.reverse\(\)/);
  assert.match(source, /Ignored internal report refresh sheet change\./);
  assert.match(source, /safeEventType === 'INSERT_GRID' \|\| safeEventType === 'REMOVE_GRID'/);
  assert.match(source, /INTERNAL_REPORT_REFRESH_TOKENS_PROP/);
  assert.match(source, /return withInternalReportRefreshGuard_\(function \(\) \{[\s\S]*runPendingTransportReportSyncUnguarded_\(pending, budgetMs, deadlineMillis, queueContext\)/);
  assert.match(read('PublicApi.gs'), /function getPendingTransportReportRefresh\(\)/);
  assert.match(read('PublicApi.gs'), /function auditManualReportFreshnessQueue\(\)/);
  assert.match(source, /E1\.6 audit:/);
});

test('E1.6R idles between queued work and limits the heavy safety sweep to hourly', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /REALTIME_SWEEP_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(source, /No due refresh work; safety scopes are processed by durable stages/);
  const queueClaim = source.indexOf('ManualReportRefreshQueueService.claimNextDue([');
  const sweepEnqueue = source.indexOf('enqueueSafetySweepIfDue_(props, nowMillis)');
  assert.ok(sweepEnqueue > -1 && queueClaim > sweepEnqueue);
  assert.match(source, /REALTIME_QUEUE_PREFERENCE_PROP/);
  assert.match(source, /pendingWork\.key === 'transport'[\s\S]*pendingWork\.key === 'fund'/);
});

test('E1.6R adds direct Fund Sheet triggers and delayed transport downstream refresh', () => {
  const source = read('SupabaseService.gs');
  const api = read('PublicApi.gs');
  assert.match(source, /newTrigger\('handleFundSheetEdit'\)\.forSpreadsheet\(targetSpreadsheetId\)\.onEdit\(\)\.create\(\)/);
  assert.match(source, /newTrigger\('handleFundSheetChange'\)\.forSpreadsheet\(targetSpreadsheetId\)\.onChange\(\)\.create\(\)/);
  assert.match(source, /safeSheetName === 'NHAP_THUCHI' \|\| safeSheetName === 'NHAP_VAY'/);
  assert.match(source, /FUND_TO_TRANSPORT_DELAY_MS = 30 \* 1000/);
  assert.match(source, /delayMs: FUND_TO_TRANSPORT_DELAY_MS/);
  assert.match(source, /source: 'fund-sheet-downstream:'[\s\S]*verificationPasses: 1|verificationPasses: 1,[\s\S]*source: 'fund-sheet-downstream:'/);
  assert.match(source, /step: 'fundPending'/);
  assert.match(api, /function installE16RTriggers\(\)/);
  assert.match(api, /function handleFundSheetEdit\(e\)/);
  assert.match(api, /function handleFundSheetChange\(e\)/);
});

test('a Fund Sheet edit keeps its exact month and requests dashboard plus report priority', () => {
  const values = new Map();
  const props = { getProperty: (key) => values.get(key) || null, setProperty: (key, value) => values.set(key, value), deleteProperty: (key) => values.delete(key) };
  const context = vm.createContext({
    console: { log() {} }, APP_CONFIG: { spreadsheetId: 'transport', year: '2026', timezone: 'Asia/Ho_Chi_Minh' },
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-09', getUuid: () => 'uuid' },
    SupabaseSyncStatusRepository: { upsert() {} }
  });
  for (const file of ['ManualReportRefreshQueueService.gs', 'SupabaseService.gs']) {
    new vm.Script(read(file), { filename: `${file}#fund-month-signal` }).runInContext(context);
  }
  const sheet = {
    getLastRow: () => 4215,
    getRange: (row, column, count) => {
      assert.equal(column, 2); assert.equal(row, 877); assert.equal(count, 1);
      return { getValues: () => [['17/09/2026']] };
    }
  };
  const range = { getSheet: () => sheet, getRow: () => 877, getNumRows: () => 1 };
  const result = context.SupabaseService.syncFundSheetChange('EDIT', 'NHAP_THUCHI', range);
  assert.equal(result.full, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), ['2026-09']);
  assert.equal(result.fundRefresh.full, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.fundRefresh.priorityMonths)), ['2026-09']);
  assert.equal(result.reportRefresh.refreshDashboard, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.reportRefresh.priorityMonths)), ['2026-09']);
});

test('webapp NHAP_THUCHI writes explicitly enqueue delayed transport reports', () => {
  const source = read('SupabaseService.gs');
  const handler = read('FundJobHandler.gs');
  assert.match(source, /function enqueueTransportReportsAfterFundWrite_\(year, options\)/);
  assert.match(source, /source: 'fund-web-write:NHAP_THUCHI'/);
  assert.match(source, /verificationPasses: 1/);
  assert.match(source, /function syncFundTransactionsAfterWrite\(year, transactions\)[\s\S]*enqueueTransportReportsAfterFundWrite_/);
  assert.match(source, /input\.transportDownstream === true[\s\S]*enqueueTransportReportsAfterFundWrite_/);
  assert.match(handler, /transportDownstream: transactionMutation/);
});

test('E1.6R fingerprints complete source sheets by month every five minutes as a trigger-independent fallback', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /SOURCE_POLL_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /sheet\.getRange\(2, 1, numRows, source\.width \|\| sheet\.getLastColumn\(\)\)\.getValues\(\)/);
  assert.match(source, /SourceFingerprintService\.build\(values/);
  assert.match(source, /SourceFingerprintService\.diff\(previous, state\)/);
  assert.match(source, /SourceFingerprintService\.serialize\(state\)/);
  assert.doesNotMatch(source, /lastRow - 24/);
  assert.match(source, /sheetName: 'NL_VanChuyen', width: 8, kind: 'transport'/);
  assert.match(source, /sheetName: 'NHAP_THUCHI', width: 14, kind: 'fund'/);
  assert.match(source, /sheetName: 'NHAP_VAY', width: 14, kind: 'fund'/);
  assert.match(source, /key: 'fund_transactions'[\s\S]*transformVersion: 'non-fund-v1'/);
  assert.match(source, /key: 'fund_loans'[\s\S]*transformVersion: 'non-fund-v1'/);
  assert.match(source, /source: 'poll:fund-downstream'/);
  assert.match(source, /verificationPasses: 1,[\s\S]*source: 'poll:fund-downstream'/);
  assert.match(source, /polledTransport[\s\S]*pending\.sheets = [^\n]*'NL_VanChuyen'/);
});

test('E1.6R polls computed report outputs by month and schedules one delayed verification pass', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /REPORT_OUTPUT_FINGERPRINT_PROP/);
  assert.match(source, /REPORT_OUTPUT_POLL_INTERVAL_MS = 60 \* 1000/);
  assert.match(source, /enqueueDetectedReportOutputChangesIfDue_\(props, nowMillis\)/);
  assert.match(source, /ReportTableService\.readFreshnessTables\(ss\)/);
  assert.match(source, /ReportOutputFreshnessService\.changedMonths/);
  assert.match(source, /source: 'poll:report-outputs'/);
  assert.match(source, /verificationPasses: 1/);
  assert.match(source, /TRANSPORT_REPORT_VERIFICATION_DELAY_MS = 120000/);
  assert.match(source, /source: 'verification:report-formulas'/);
});

test('E1.6R retries queue contention without acknowledging a source fingerprint early', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /function withRefreshQueueLock_/);
  assert.match(source, /lock\.tryLock\(1000\)/);
  assert.match(source, /busy\.refreshDeferred = true/);
  assert.match(source, /enqueueRefreshWithFallback_[\s\S]*yearPropertyKey_\(SOURCE_POLL_NEXT_AT_PROP\), '0'/);
  assert.match(source, /if \(queued && queued\.deferred\) throw new Error[\s\S]*props\.setProperty\(propertyKey, SourceFingerprintService\.serialize\(state\)\)/);
  assert.match(source, /sourcePollNextAtKey, String\(nowMillis \+ SOURCE_POLL_RETRY_MS\)[\s\S]*source_poll_failed:/);
});

test('a successful queue request resolves the matching deferred sync status', () => {
  const source = read('SupabaseService.gs');
  const enqueueBlock = source.slice(
    source.indexOf('  function enqueueRefreshWithFallback_'),
    source.indexOf('  function getPendingTransportReportRefresh')
  );
  assert.match(enqueueBlock, /ManualReportRefreshQueueService\.enqueue/);
  assert.match(enqueueBlock, /'refresh_queue_deferred:' \+ clean_\(queueName\)[\s\S]*'ok'[\s\S]*Refresh request queued successfully/);
  assert.match(enqueueBlock, /catch \(err\)[\s\S]*'refresh_queue_deferred:' \+ clean_\(queueName\)[\s\S]*'error'/);
});
