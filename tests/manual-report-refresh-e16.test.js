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

test('E1.6 Supabase facade prioritizes due manual reports and refreshes Tất cả', () => {
  const source = read('SupabaseService.gs');
  const claimOffset = source.indexOf('ManualReportRefreshQueueService.claimDue');
  const rotationOffset = source.indexOf('var steps = buildRealtimeTickSteps_()', claimOffset);
  assert.ok(claimOffset > -1 && rotationOffset > claimOffset);
  assert.match(source, /step: 'transportReportsPending'/);
  assert.match(source, /syncReportBundle\('Tất cả'\)/);
  assert.match(source, /safeEventType !== 'EDIT' && safeEventType !== 'MANUAL_TEST'/);
  assert.match(source, /full: true,[\s\S]*source: 'sheet:unknown:'/);
  assert.match(source, /ManualReportRefreshQueueService\.requeue\(pending, context\)/);
  assert.match(source, /Ignored internal report refresh sheet change\./);
  assert.match(source, /safeEventType === 'INSERT_GRID' \|\| safeEventType === 'REMOVE_GRID'/);
  assert.match(source, /INTERNAL_REPORT_REFRESH_TOKENS_PROP/);
  assert.match(source, /return withInternalReportRefreshGuard_\(function \(\) \{[\s\S]*runPendingTransportReportSyncUnguarded_\(pending\)/);
  assert.match(read('PublicApi.gs'), /function getPendingTransportReportRefresh\(\)/);
  assert.match(read('PublicApi.gs'), /function auditManualReportFreshnessQueue\(\)/);
  assert.match(source, /E1\.6 audit:/);
});

test('E1.6R idles between queued work and limits the heavy safety sweep to hourly', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /REALTIME_SWEEP_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(source, /if \(!claimRealtimeSweep_\(props, nowMillis\)\)[\s\S]*No due refresh work; hourly safety sweep is not due/);
  const transportClaim = source.indexOf('ManualReportRefreshQueueService.claimDue(manualReportRefreshQueueContext_())');
  const fundClaim = source.indexOf('ManualReportRefreshQueueService.claimDue(fundRefreshQueueContext_())', transportClaim);
  const sweepClaim = source.indexOf('claimRealtimeSweep_(props, nowMillis)', fundClaim);
  assert.ok(transportClaim > -1 && fundClaim > transportClaim && sweepClaim > fundClaim);
});

test('E1.6R adds direct Fund Sheet triggers and delayed transport downstream refresh', () => {
  const source = read('SupabaseService.gs');
  const api = read('PublicApi.gs');
  assert.match(source, /newTrigger\('handleFundSheetEdit'\)\.forSpreadsheet\(targetSpreadsheetId\)\.onEdit\(\)\.create\(\)/);
  assert.match(source, /newTrigger\('handleFundSheetChange'\)\.forSpreadsheet\(targetSpreadsheetId\)\.onChange\(\)\.create\(\)/);
  assert.match(source, /safeSheetName === 'NHAP_THUCHI' \|\| safeSheetName === 'NHAP_VAY'/);
  assert.match(source, /delayMs: FUND_TO_TRANSPORT_DELAY_MS/);
  assert.match(source, /step: 'fundPending'/);
  assert.match(api, /function installE16RTriggers\(\)/);
  assert.match(api, /function handleFundSheetEdit\(e\)/);
  assert.match(api, /function handleFundSheetChange\(e\)/);
});

test('E1.6R polls bounded source tails every five minutes as a trigger-independent fallback', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /SOURCE_POLL_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /lastRow - 24/);
  assert.match(source, /sheet\.getRange\(startRow, 1, numRows, source\.width\)\.getValues\(\)/);
  assert.match(source, /sheetName: 'NL_VanChuyen', width: 8, kind: 'transport'/);
  assert.match(source, /sheetName: 'NHAP_THUCHI', width: 14, kind: 'fund'/);
  assert.match(source, /sheetName: 'NHAP_VAY', width: 14, kind: 'fund'/);
  assert.match(source, /source: 'poll:fund-downstream'/);
  assert.match(source, /polledTransport[\s\S]*syncManageDataBundle\('NL_VanChuyen'\)/);
});

test('E1.6R retries queue contention without acknowledging a source fingerprint early', () => {
  const source = read('SupabaseService.gs');
  assert.match(source, /REFRESH_QUEUE_LOCK_WAIT_MS = 30 \* 1000/);
  assert.match(source, /lock\.waitLock\(REFRESH_QUEUE_LOCK_WAIT_MS\)/);
  assert.match(source, /enqueueRefreshWithFallback_[\s\S]*SOURCE_POLL_NEXT_AT_PROP, '0'/);
  assert.match(source, /if \(queued && queued\.deferred\) throw new Error[\s\S]*props\.setProperty\(propertyKey, state\.fingerprint\)/);
  assert.match(source, /SOURCE_POLL_NEXT_AT_PROP, String\(nowMillis \+ SOURCE_POLL_RETRY_MS\)[\s\S]*source_poll_failed:/);
});
