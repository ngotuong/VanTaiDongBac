const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPayrollExplanationService } = require('../server/services/payroll-explanation-service');

const root = path.resolve(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

function pipeline() {
  let now = Date.parse('2026-10-04T05:00:00Z');
  let version = 'source-1';
  let fail = '';
  let advanceDuring = '';
  const props = new Map();
  const cache = new Map();
  const reports = new Map();
  const explanations = new Map();
  const operations = [];
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/payroll-explanation-mixed-salary.json'), 'utf8'));
  const fixtureBefore = JSON.stringify(fixture);
  const spreadsheet = { getSheetByName(name) {
    const sheet = fixture.sheets[name];
    if (!sheet) return null;
    const matrix = [...Array.from({ length: sheet.headerRow - 1 }, () => []), sheet.headers, ...sheet.rows];
    return {
      getLastRow: () => matrix.length,
      getLastColumn: () => sheet.headers.length,
      getRange: (r, c, height, width) => ({
        getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => matrix[r - 1 + i]?.[c - 1 + j] ?? ''))
      })
    };
  } };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const sandbox = vm.createContext({
    Date: ClockDate, console: { log() {} },
    APP_CONFIG: { spreadsheetId: 'synthetic-workbook', timezone: 'Asia/Ho_Chi_Minh' },
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById(id) { assert.equal(id, 'synthetic-workbook'); return spreadsheet; } },
    Utilities: { formatDate: () => '2026-10', getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(value).digest()] },
    ReportService: {
      getReportDataVersion: () => version, getReportCacheVersion: () => 'v13',
      beginReportRefreshBatch: () => version,
      getDashboard: () => ({}),
      getReportBundle(month, force, options) {
        assert.equal(force, true); assert.equal(options.suppressSupabaseWrite, true);
        if (fail === 'build') throw new Error('injected build failure');
        if (advanceDuring === 'report') version = 'source-changed';
        return { selected: month, overview: { months: [['Tháng'], [month]], details: [] }, payroll: fixture.sheets.BC_BangLuong.rows };
      }
    },
    SupabaseBundleRepository: { upsertRows(table, rows) {
      assert.equal(table, 'report_bundles');
      for (const row of rows) {
        if (row.report_month !== '__dashboard_latest__' && fail === 'report') throw new Error('injected report persistence failure');
        reports.set(row.report_month, plain(row)); operations.push(`report:${row.report_month}`);
      }
    } },
    SupabaseSyncStatusRepository: { upsert() {} },
    SupabaseHttpClient: { callRpc(name, body) {
      assert.equal(name, 'replace_payroll_explanation_month_v6');
      if (fail === 'payroll') throw new Error('injected payroll persistence failure');
      explanations.set(body.p_report_month, plain(body.p_rows)); operations.push(`v6:${body.p_report_month}`);
      if (advanceDuring === 'payroll') version = 'source-changed';
    } }
  });
  for (const file of ['SheetChangeSignalService.gs', 'TransportSourceProbeService.gs', 'FundOverviewSnapshotService.gs', 'ManualReportRefreshQueueService.gs', 'TransportRefreshWorker.gs', 'NotificationPipelineService.gs', 'PayrollExplanationService.gs', 'PayrollExplanationSyncService.gs', 'SupabaseReportCacheRepository.gs', 'ReportSyncService.gs', 'SupabaseService.gs']) {
    new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }).runInContext(sandbox);
  }
  function disableUnrelatedTicks() {
    for (const key of ['SUPABASE_TRIP_NOTIFICATION_NEXT_AT', 'SUPABASE_SOURCE_POLL_NEXT_AT', 'SUPABASE_REPORT_OUTPUT_POLL_NEXT_AT', 'SUPABASE_REALTIME_SWEEP_NEXT_AT', 'SUPABASE_REALTIME_HEARTBEAT_NEXT_AT']) props.set(key, String(now + 3600000));
  }
  disableUnrelatedTicks();
  const service = sandbox.SupabaseService;
  return {
    service, reports, explanations, operations,
    advance(ms) { now += ms; disableUnrelatedTicks(); },
    setFailure(value) { fail = value; }, setVersion(value) { version = value; },
    advanceSourceDuring(value) { advanceDuring = value; },
    assertNoSheetWrites() { assert.equal(JSON.stringify(fixture), fixtureBefore); },
    async read() {
      let response;
      const api = createPayrollExplanationService({
        repository: { async findOne() { return explanations.get('09/2026')?.[0] ?? null; }, async findReportVersion() { return reports.get('09/2026') ?? null; } },
        workbookContextService: { resolve: () => ({ spreadsheetId: 'synthetic-workbook' }) },
        httpError: (status, message) => Object.assign(new Error(message), { status }),
        send: (_res, status, body) => { response = { status, body }; }
      });
      await api.handle('getPayrollExplanation', { method: 'GET', query: { month: '09/2026', employee: 'Chu Đức Mười', year: '2026' } }, {}, {}, { role: 'operator' });
      return response;
    }
  };
}

test('R8 refresh traverses producer, real worker, v6 replacement, report publication and API across source versions', async () => {
  const p = pipeline();
  for (const version of ['source-1', 'source-2', 'source-3']) {
    p.setVersion(version);
    assert.equal(p.service.requestPayrollExplanationRefresh('09/2026').queued, true);
    p.advance(15001);
    const result = p.service.syncRealtimeCache();
    assert.equal(result.step, 'transportReportsPending'); assert.equal(result.ok, true);
    assert.equal(result.acknowledgement.acknowledged, true);
    assert.equal(p.service.getPendingTransportReportRefresh().pending, null);
    assert.equal(p.reports.get('09/2026').source_data_version, version);
    assert.equal(p.explanations.get('09/2026')[0].source_data_version, version);
    const response = await p.read(); assert.equal(response.status, 200); assert.equal(response.body.stale, false);
    assert.equal(response.body.explanation.contractVersion, 'payroll-explanation-v6');
  }
  assert.deepEqual(p.operations.filter((value) => !value.includes('__dashboard_latest__')), Array.from({ length: 3 }, () => ['v6:09/2026', 'report:09/2026']).flat());
  p.assertNoSheetWrites();
});

for (const stage of ['report', 'payroll']) test(`R8 source version advancing during ${stage} build prevents report publication and retries`, async () => {
  const p = pipeline();
  p.service.requestPayrollExplanationRefresh('09/2026'); p.advance(15001); assert.equal(p.service.syncRealtimeCache().ok, true);
  p.setVersion('source-2'); p.advanceSourceDuring(stage);
  p.service.requestPayrollExplanationRefresh('09/2026'); p.advance(15001);
  assert.equal(p.service.syncRealtimeCache().ok, false);
  assert.equal(p.reports.get('09/2026').source_data_version, 'source-1');
  assert.notEqual(p.service.getPendingTransportReportRefresh().pending, null);
  p.advanceSourceDuring(''); p.advance(30001);
  assert.equal(p.service.syncRealtimeCache().ok, true);
  assert.equal(p.reports.get('09/2026').source_data_version, 'source-changed');
  assert.equal(p.explanations.get('09/2026')[0].source_data_version, 'source-changed');
  assert.equal((await p.read()).body.stale, false); p.assertNoSheetWrites();
});

for (const failure of ['build', 'payroll', 'report']) test(`R8 refresh ${failure} failure retains retry work and recovers without publishing stale payload`, async () => {
  const p = pipeline();
  p.service.requestPayrollExplanationRefresh('09/2026'); p.advance(15001); assert.equal(p.service.syncRealtimeCache().ok, true);
  p.setVersion('source-2'); p.setFailure(failure);
  p.service.requestPayrollExplanationRefresh('09/2026'); p.advance(15001);
  const failed = p.service.syncRealtimeCache(); assert.equal(failed.ok, false); assert.equal(failed.acknowledgement.retryQueued, true);
  assert.equal(p.reports.get('09/2026').source_data_version, 'source-1');
  if (failure === 'report') { const response = await p.read(); assert.equal(response.body.stale, true); assert.equal(response.body.explanation, null); }
  p.setFailure(''); p.advance(30001);
  const retry = p.service.syncRealtimeCache(); assert.equal(retry.ok, true); assert.equal(retry.acknowledgement.acknowledged, true);
  assert.equal(p.service.getPendingTransportReportRefresh().pending, null);
  assert.equal(p.reports.get('09/2026').source_data_version, 'source-2');
  assert.equal((await p.read()).body.stale, false); p.assertNoSheetWrites();
});
