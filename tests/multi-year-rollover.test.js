const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { selectedWorkbookYearFromCookie, workbookYearCookie } = require('../server/services/workbook-year-cookie-service');
const { syncKeyBelongsToYear } = require('../server/services/notification-center-service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function appConfig(properties = {}) {
  const store = new Map(Object.entries(properties));
  const sandbox = vm.createContext({
    normalizeCleanValue_: (value) => String(value ?? '').trim(),
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => store.get(key) || '',
      getProperties: () => Object.fromEntries(store)
    }) }
  });
  vm.runInContext(read('AppConfig.gs'), sandbox);
  return sandbox;
}

test('Apps Script resolves only configured year/workbook pairs while preserving the 2026 bootstrap', () => {
  const legacy = appConfig();
  assert.equal(legacy.APP_CONFIG.year, '2026');
  const currentId = legacy.APP_CONFIG.spreadsheetId;
  assert.equal(legacy.AppConfig.activate({ year: '2026' }).spreadsheetId, currentId);
  assert.equal(legacy.AppConfig.activate({ year: '2026', spreadsheetId: currentId }).spreadsheetId, currentId);
  assert.throws(() => legacy.AppConfig.activate({ year: '2026', spreadsheetId: 'untrusted-id' }), /Chưa cấu hình|khớp/);

  const configured = appConfig({
    ACTIVE_WORKBOOK_YEAR: '2026', DEFAULT_WORKBOOK_YEAR: '2026', ACTIVE_SPREADSHEET_ID: 'transport-2026',
    SPREADSHEET_ID_2026: 'transport-2026', SPREADSHEET_ID_2027: 'transport-2027'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(configured.AppConfig.activate({ year: '2027', spreadsheetId: 'transport-2027' }))).year, '2027');
  assert.throws(() => configured.AppConfig.activate({ year: '2027', spreadsheetId: 'transport-attacker' }), /không khớp/);
  assert.throws(() => configured.AppConfig.activate({ year: '2028', spreadsheetId: 'transport-attacker' }), /Chưa cấu hình/);
});

test('selected year cookie is HttpOnly, same-origin scoped and rejects malformed years', () => {
  const cookie = workbookYearCookie('2025', { secure: true });
  assert.match(cookie, /^vtdb_workbook_year=2025;/);
  for (const token of ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=']) assert.match(cookie, new RegExp(token));
  assert.equal(selectedWorkbookYearFromCookie(`session=x; ${cookie}`), '2025');
  assert.equal(selectedWorkbookYearFromCookie('vtdb_workbook_year=25'), '');
  assert.equal(selectedWorkbookYearFromCookie('vtdb_workbook_year=%E0%A4%A'), '');
  assert.throws(() => workbookYearCookie('202X'), /không hợp lệ/);
});

test('year rollover audit is read-only, checks active work, and activation remains token/rollback guarded', () => {
  const migration = read('YearRolloverMigration.gs');
  assert.match(migration, /SpreadsheetApp\.openById/);
  assert.match(migration, /getFormulas\(\)/);
  assert.match(migration, /sheetOrderMatches/);
  assert.match(migration, /narrowedSheets/);
  assert.match(migration, /compareHeaderRows_/);
  assert.match(migration, /WriteJobRepository\.listActiveForRollover/);
  assert.match(migration, /SUPABASE_SHEET_SIGNAL_/);
  assert.match(migration, /SUPABASE_REALTIME_TICK_RUNNING_/);
  assert.match(migration, /WRITE_QUEUE_PAUSED/);
  assert.match(migration, /confirmationToken !== report\.confirmationToken/);
  assert.match(migration, /restore_\(props, previous\)/);
  assert.doesNotMatch(migration, /\.setValues\(|\.clearContent\(|\.deleteRow\(|\.insertRow/);
});

test('browser/server read paths and cache generations carry the selected year end to end', () => {
  const dashboard = read('next-shell/components/dashboard/DashboardModule.tsx');
  const dashboardRoute = read('next-shell/app/dashboard-data/route.ts');
  const report = read('next-shell/components/report/ReportModule.tsx');
  const reportRoute = read('next-shell/app/report-data/route.ts');
  assert.match(dashboard, /url\.searchParams\.set\('year', year\)/);
  assert.match(dashboardRoute, /loadDashboardData\([^,]+, context\.workbook\.year\)/);
  assert.match(report, /url\.searchParams\.set\('year', year\)/);
  assert.match(reportRoute, /loadReportRangeData\(fromMonth, toMonth, forceRefresh, year\)/);
  assert.match(read('SheetService.gs'), /REPORT_DATA_VERSION_PROP \+ '_' \+ year/);
  assert.match(read('FundService.gs'), /FUND_DATA_VERSION_PROP \+ '_' \+ year/);
});

test('operational status year filter rejects explicit rows from another year and keeps global health rows', () => {
  assert.equal(syncKeyBelongsToYear('2026:manage_data:NL_Dau:recent_500', '2026'), true);
  assert.equal(syncKeyBelongsToYear('2025:manage_data:NL_Dau:recent_500', '2026'), false);
  assert.equal(syncKeyBelongsToYear('payroll_explanations:09/2025', '2026'), false);
  assert.equal(syncKeyBelongsToYear('realtime_cache_worker', '2026'), true);
});

test('multi-year cache migration is additive and preserves legacy rollback rows', () => {
  const sql = read('supabase/migrations/019_multi_year_cache_namespace.sql');
  assert.match(sql, /insert into public\.startup_bundles/);
  assert.match(sql, /'2026:' \|\| form_type/);
  assert.match(sql, /'transport:2026:' \|\| catalog_key/);
  assert.match(sql, /'2026:' \|\| sheet_name/);
  assert.match(sql, /on conflict \([^)]*\) do nothing/g);
  assert.doesNotMatch(sql, /delete\s+from|drop\s+table|alter\s+table/i);
});
