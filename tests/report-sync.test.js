const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadService(overrides = {}) {
  const vmContext = vm.createContext({});
  new vm.Script(read('ReportSyncService.gs'), { filename: 'ReportSyncService.gs#test' }).runInContext(vmContext);
  const calls = { bundles: [], dashboards: [], upserts: [], statuses: [], batchStarts: 0 };
  const syncTime = '2026-07-11T15:00:00.000Z';
  const dataVersion = 'data-version-1';
  const reportMonths = ['05/2026', '06/2026', '07/2026'];
  const context = {
    spreadsheetId: 'synthetic-transport-sheet',
    clean(value) {
      return value === null || value === undefined ? '' : String(value).trim();
    },
    nowISOString() { return syncTime; },
    getReportBundle(month, forceRefresh, options) {
      calls.bundles.push({ month, forceRefresh, options });
      return { overview: { months: [['Tháng'], ...reportMonths.map((item) => [item])] }, selected: month };
    },
    beginReportRefreshBatch() { calls.batchStarts += 1; return dataVersion; },
    getReportDataVersion() { return dataVersion; },
    getReportCacheVersion() { return 'v13'; },
    upsertReportBundle(options) { calls.upserts.push({ operation: 'reportBundle', options }); },
    getDashboard(month, forceRefresh) {
      calls.dashboards.push({ month, forceRefresh });
      return { latestTrips: { date: '04/07/2026', trips: [] } };
    },
    getReportSheet() {
      return {
        getLastRow: () => 4,
        getLastColumn: () => 17,
        getRange: () => ({
          getDisplayValues: () => [['Tháng'], ...reportMonths.map((item) => [item])]
        })
      };
    },
    upsertRows(tableName, rows, onConflict) {
      calls.upserts.push({ tableName, rows, onConflict });
    },
    writeSyncStatus(...args) { calls.statuses.push(args); },
    runSyncStep(results, errors, name, fn) {
      try { results.push({ name, result: fn() }); }
      catch (error) { errors.push({ name, error: error.message }); }
    },
    isManageSheetName(name) { return /^NL_/.test(name); },
    getTransportRowsMonthKeys(rows) { return rows.length ? ['2026-07'] : []; },
    normalizeYearMonthKey(month) {
      const match = String(month).match(/^(\d{2})\/(\d{4})$/);
      return match ? `${match[2]}-${match[1]}` : '';
    },
    formatMonthKeyForReport(month) {
      const [year, value] = month.split('-');
      return `${value}/${year}`;
    },
    ...overrides
  };
  return { service: vmContext.ReportSyncService, context, calls, syncTime, dataVersion };
}

test('report bundle and dashboard sync preserve rows, conflict key, status, and response', () => {
  const { service, context, calls, syncTime, dataVersion } = loadService();
  const report = service.syncReportBundle('latest', context);
  const dashboard = service.syncDashboard(context);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), {
    ok: true, table: 'report_bundles', spreadsheetId: 'synthetic-transport-sheet',
    reportMonth: '07/2026', dataVersion, syncedAt: syncTime
  });
  assert.deepEqual(JSON.parse(JSON.stringify(dashboard)), {
    ok: true, table: 'report_bundles', reportMonth: '__dashboard_latest__', syncedAt: syncTime
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.upserts)), [
    {
      operation: 'reportBundle',
      options: {
        spreadsheetId: 'synthetic-transport-sheet', reportMonth: '07/2026',
        sourceSheetNames: ['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe', 'BC_TongHopDuAn'],
        bundle: { overview: { months: [['Tháng'], ['05/2026'], ['06/2026'], ['07/2026']] }, selected: 'latest' },
        cacheVersion: 'v13', dataVersion, syncedAt: syncTime
      }
    },
    {
      tableName: 'report_bundles',
      rows: [{
        spreadsheet_id: 'synthetic-transport-sheet', report_month: '__dashboard_latest__',
        source_sheet_names: ['BC_TongQuan', 'NL_VanChuyen'],
        payload: { latestTrips: { date: '04/07/2026', trips: [] } }, synced_at: syncTime
      }],
      onConflict: 'spreadsheet_id,report_month'
    }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.statuses)), [
    ['dashboard', 'transport', 'ok', 'Dashboard cache synced.', syncTime]
  ]);
});

test('full report sync preserves Sheet month order, all target, and isolated errors', () => {
  const original = loadService();
  const result = original.service.syncAllReportBundles(original.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), ['05/2026', '06/2026', '07/2026', 'Tất cả']);
  assert.equal(result.synced, 4);
  assert.equal(result.failed, 0);
  assert.equal(result.dataVersion, original.dataVersion);
  assert.equal(original.calls.batchStarts, 1);
  assert.deepEqual(original.calls.bundles.map((call) => call.month), ['Tất cả', '05/2026', '06/2026', '07/2026']);
  assert.equal(new Set(original.calls.bundles.map((call) => call.options.dataVersion)).size, 1);
  assert.equal(original.calls.bundles.every((call) => call.options.skipInvalidation === true), true);
  assert.equal(original.calls.bundles.every((call) => call.options.suppressSupabaseWrite === true), true);

  const failed = loadService({
    getReportBundle(month) {
      if (month === '06/2026') throw new Error('synthetic report failure');
      return { overview: { months: [['Tháng'], ['07/2026']] } };
    }
  });
  const failedResult = failed.service.syncAllReportBundles(failed.context);
  assert.equal(failedResult.ok, false);
  assert.equal(failedResult.synced, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(failedResult.errors)), [
    { reportMonth: '06/2026', error: 'synthetic report failure' }
  ]);
});

test('after-write report sync preserves explicit/fallback month selection, includeAll, and status key', () => {
  const explicit = loadService();
  const result = explicit.service.syncTransportReportsAfterWrite('NL_VanChuyen', [{}], { includeAll: true }, explicit.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), ['2026-07']);
  assert.equal(result.synced, 2);
  assert.deepEqual(explicit.calls.bundles.map((call) => call.month), ['07/2026', 'Tất cả']);
  assert.deepEqual(JSON.parse(JSON.stringify(explicit.calls.statuses)), [[
    'transport_reports_after_write:NL_VanChuyen', 'transport', 'ok',
    'Transport report cache synced after write.', explicit.syncTime
  ]]);

  const fallback = loadService();
  const fallbackResult = fallback.service.syncTransportReportsAfterWrite('NL_TaiXe', [], {}, fallback.context);
  assert.deepEqual(JSON.parse(JSON.stringify(fallbackResult.months)), ['2026-07', '2026-06']);
  assert.deepEqual(fallback.calls.bundles.map((call) => call.month), ['07/2026', '06/2026']);
  const skipped = fallback.service.syncTransportReportsAfterWrite('DM_Xe', [], {}, fallback.context);
  assert.deepEqual(JSON.parse(JSON.stringify(skipped)), {
    ok: true, skipped: true, synced: 0, failed: 0, reason: 'Sheet is not a transport manage sheet.'
  });
});

test('SupabaseService retains report facades while ReportSyncService owns report sync implementation', () => {
  const facade = read('SupabaseService.gs');
  const implementation = read('ReportSyncService.gs');
  assert.match(facade, /ReportSyncService\.syncReportBundle\(month, reportSyncContext_\(\)\)/);
  assert.match(facade, /ReportSyncService\.syncDashboard\(reportSyncContext_\(\)\)/);
  assert.match(facade, /ReportSyncService\.syncTransportReportsAfterWrite\(sheetName, rows, options, reportSyncContext_\(\)\)/);
  assert.doesNotMatch(facade, /source_sheet_names: \['BC_TongQuan', 'BC_BangLuong', 'BC_TongHopXe'\]/);
  assert.match(implementation, /var DASHBOARD_REPORT_MONTH = '__dashboard_latest__'/);
});
