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
