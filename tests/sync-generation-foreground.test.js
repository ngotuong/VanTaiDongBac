const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stable = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const hash = (value) => crypto.createHash('sha256').update(stable(value)).digest('base64url');
const hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

function load(file) {
  const context = vm.createContext({ console });
  new vm.Script(read(file), { filename: `${file}#test` }).runInContext(context);
  return context;
}

function workbook(rows = [[new Date('2026-10-31T00:00:00Z'), '10/2026', '51A']]) {
  const display = rows.map((row) => row.map((value) => value instanceof Date ? '31/10/2026' : String(value)));
  const sheet = {
    getSheetId: () => 731,
    getName: () => 'NL_Dau',
    getMaxRows: () => 1000,
    getLastColumn: () => 3,
    getRange: (startRow, startColumn, numRows, width) => {
      assert.deepEqual([startRow, startColumn, numRows, width], [25, 1, rows.length, 3]);
      return { getValues: () => rows, getDisplayValues: () => display };
    }
  };
  return { getSheets: () => [sheet] };
}

function generation(overrides = {}) {
  return {
    event_key: 'sg_test_foreground_01', lease_token: 'lease-1', workbook_year: '2026', module: 'transport',
    structural: false, full_refresh: false, source_committed_at: '2026-11-08T00:59:00.000Z',
    last_signal_at: '2026-11-08T00:59:00.000Z', scope_row_ranges: ['731:25:1'], scope_grid_ids: [731],
    scope_start_row: 25, scope_num_rows: 1, scope_months: ['2026-10'], ...overrides
  };
}

test('D3 worker hashes a narrow live scope and matches legacy read models without publishing', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const dashboard = { updatedAt: 'new', overview: { kpis: [1] }, inputs: [], latestTrips: { date: '31/10/2026', trips: [] }, links: { spreadsheet: 'x' } };
  const report = { updatedAt: 'new', overview: { months: [['Tháng'], ['10/2026']], details: [['A', '1']] }, payroll: [['Tháng']], vehicles: [], projectGroups: [], projects: [], links: { spreadsheet: 'x' } };
  const calls = [];
  const context = {
    openWorkbook: (year) => { calls.push(['open', year]); return { spreadsheet: workbook(), spreadsheetId: 'transport-2026' }; },
    getReportDataVersion: () => 'report-v42',
    getDashboard: (_month, force, options) => { calls.push(['dashboard', force, options]); return dashboard; },
    getReportBundle: (month, force, options) => { calls.push(['report', month, force, options]); return report; },
    readLegacyRows: (_id, months) => {
      calls.push(['legacy', months]);
      return [
        { report_month: '10/2026', source_data_version: 'report-v42', synced_at: '2026-11-08T01:00:00.000Z', payload: { ...report, updatedAt: 'legacy' } },
        { report_month: '__dashboard_latest__', source_data_version: 'report-v42', synced_at: '2026-11-08T01:00:00.000Z', payload: { ...dashboard, updatedAt: 'legacy' } }
      ];
    },
    hashPayload: hash, stableStringify: stable, sha256Hex: hex,
    formatMonth: () => '2026-10', nowISOString: () => '2026-11-08T01:00:00.000Z'
  };
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), context);
  assert.equal(result.action, 'complete');
  assert.equal(result.shadowMatch, true);
  assert.equal(result.shadowMonth, '10/2026');
  assert.match(result.shadowSourceHash, /^[a-f0-9]{64}$/);
  assert.equal(calls[0][0], 'open');
  assert.equal(calls.find((call) => call[0] === 'report')[3].suppressSupabaseWrite, true);
  assert.equal(calls.find((call) => call[0] === 'report')[3].suppressRuntimeCacheWrite, true);
  assert.equal(calls.find((call) => call[0] === 'report')[3].forceLiveDetails, true);
  assert.equal(calls.some((call) => /upsert|publish|write/.test(call[0])), false);
});

test('D3 worker retries while both legacy bundles still predate the source commit', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const payload = { overview: {}, payroll: [], vehicles: [], projectGroups: [], projects: [], links: {} };
  const context = {
    openWorkbook: () => ({ spreadsheet: workbook(), spreadsheetId: 'transport-2026' }),
    getReportDataVersion: () => 'report-v42', getDashboard: () => payload, getReportBundle: () => payload,
    readLegacyRows: () => [
      { report_month: '10/2026', source_data_version: 'report-v42', synced_at: '2026-11-08T00:58:59.000Z', payload },
      { report_month: '__dashboard_latest__', source_data_version: 'report-v42', synced_at: '2026-11-08T00:58:59.000Z', payload }
    ],
    hashPayload: hash, stableStringify: stable, sha256Hex: hex,
    formatMonth: () => '2026-10', nowISOString: () => '2026-11-08T01:00:00.000Z'
  };
  const result = sandbox.SyncGenerationForegroundWorker.run(generation(), context);
  assert.equal(result.action, 'retry');
  assert.equal(result.errorClass, 'legacy_bundle_not_ready');
  assert.equal(result.shadowResult, 'not_ready');
});

test('D3 worker fails closed for structural or multi-month scope', () => {
  const sandbox = load('SyncGenerationForegroundWorker.gs');
  const unused = { openWorkbook: () => { throw new Error('must not open'); } };
  assert.equal(sandbox.SyncGenerationForegroundWorker.run(generation({ structural: true }), unused).errorClass, 'unsupported_full_or_structural');
  const twoRows = [[new Date('2026-10-31T00:00:00Z'), '10/2026', 'A'], [new Date('2026-11-01T00:00:00Z'), '11/2026', 'B']];
  const context = {
    openWorkbook: () => ({ spreadsheet: workbook(twoRows), spreadsheetId: 'transport-2026' }),
    sha256Hex: hex, stableStringify: stable, formatMonth: (date) => date.getUTCMonth() === 9 ? '2026-10' : '2026-11'
  };
  const result = sandbox.SyncGenerationForegroundWorker.run(generation({ scope_row_ranges: ['731:25:2'], scope_num_rows: 2, scope_months: [] }), context);
  assert.equal(result.terminal, true);
  assert.equal(result.errorClass, 'multi_month_scope');
});

test('D3 dispatcher is disabled by default and otherwise requests before exact claim', () => {
  const sandbox = load('SyncGenerationForegroundDispatcher.gs');
  const calls = [];
  const repository = {
    requestDispatch: (key) => { calls.push(['request', key]); return { not_before: '2026-11-08T01:00:00.000Z' }; },
    claimOne: (key) => { calls.push(['claim', key]); return generation(); },
    completeShadow: (input) => { calls.push(['complete', input.eventKey]); return { status: 'shadowed' }; },
    retryShadow: () => { throw new Error('unexpected retry'); }
  };
  const base = {
    repository, worker: { run: () => ({ action: 'complete', shadowResult: 'matched', shadowMatch: true }) }, workerContext: {},
    buildStamp: 'candidate-d3', nowMillis: () => Date.parse('2026-11-08T01:00:00.000Z'), sleep: () => {}, workerId: () => 'worker'
  };
  const recorded = { recorded: true, eventKey: 'sg', row: { module: 'transport' } };
  assert.equal(sandbox.SyncGenerationForegroundDispatcher.dispatchRecorded(recorded, { ...base, isEnabled: () => false }).enabled, false);
  assert.deepEqual(calls, []);
  assert.equal(sandbox.SyncGenerationForegroundDispatcher.dispatchRecorded({ ...recorded, row: { module: 'fund' } }, { ...base, isEnabled: () => true }).reason, 'unsupported_module');
  assert.deepEqual(calls, []);
  const result = sandbox.SyncGenerationForegroundDispatcher.dispatchRecorded(recorded, { ...base, isEnabled: () => true });
  assert.equal(result.status, 'shadowed');
  assert.deepEqual(calls.map((call) => call[0]), ['request', 'claim', 'complete']);
});

test('D3 SQL is server-only, lease-owned, metadata-only, and does not publish read models', () => {
  const sql = read('supabase/migrations/023_sync_generation_dispatch_shadow.sql');
  assert.match(sql, /create or replace function public\.request_sync_generation_dispatch/i);
  assert.match(sql, /create or replace function public\.claim_sync_generation/i);
  assert.match(sql, /create or replace function public\.complete_sync_generation_shadow/i);
  assert.match(sql, /generations\.lease_token = p_lease_token/i);
  assert.match(sql, /revoke all .* from public, anon, authenticated/is);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.report_bundles|update\s+public\.report_bundles/i);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /jsonb|payload/i);
});

test('foreground reconciler remains separate from the legacy minute publisher', () => {
  const source = read('SupabaseService.gs');
  const tickStart = source.indexOf('  function syncRealtimeCache()');
  const tickEnd = source.indexOf('\n  function ', tickStart + 20);
  const tick = source.slice(tickStart, tickEnd);
  assert.doesNotMatch(tick, /ForegroundDispatcher|reconcileSyncGenerationShadow/);
  assert.match(source, /function reconcileSyncGenerationShadow\(\)[\s\S]*SyncGenerationForegroundDispatcher\.reconcile/);
  assert.match(read('RuntimeBuild.gs'), /sync-generation-steady-state-20261112-v1/);
});
