const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/baseline-characterization.json'));

function loadBackendKeyBuilders() {
  let source = read('SupabaseService.gs');
  const returnIndex = source.lastIndexOf('  return {');
  assert.ok(returnIndex >= 0, 'Could not locate SupabaseService public return object.');
  source = source.slice(0, returnIndex)
    + `  return { __cacheKeyTest: {
        normalizeFundMonthKey: normalizeFundMonthKey_,
        buildFundTransactionFilterKey: buildFundTransactionFilterKey_,
        buildCatalogsKey: buildCatalogsKey_,
        buildCatalogDataKey: buildCatalogDataKey_,
        buildFundFormOptionsKey: buildFundFormOptionsKey_,
        buildFundCatalogKey: buildFundCatalogKey_,
        buildManageMonthFilterKey: buildManageMonthFilterKey_
      },`
    + source.slice(returnIndex + '  return {'.length);

  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null })
    },
    Utilities: {
      base64EncodeWebSafe: (value) => Buffer.from(String(value), 'utf8').toString('base64url')
    }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#cache-key-test' }).runInContext(context);
  new vm.Script(read('StartupCatalogSyncService.gs'), { filename: 'StartupCatalogSyncService.gs#cache-key-test' }).runInContext(context);
  new vm.Script(read('ManageSyncService.gs'), { filename: 'ManageSyncService.gs#cache-key-test' }).runInContext(context);
  new vm.Script(source, { filename: 'SupabaseService.gs#cache-key-test' }).runInContext(context);
  return context.SupabaseService.__cacheKeyTest;
}

function loadFrontendKeyBuilders() {
  const source = read('client_api.html')
    .replace(/^\s*<script[^>]*>/i, '')
    .replace(/<\/script>\s*$/i, '');
  const context = vm.createContext({
    URL,
    window: {
      __DEFAULT_APP_SERVICE_URL: '',
      __APP_SERVICE_URL: '',
      __SUPABASE_CONFIG: {},
      location: { origin: 'https://example.test' }
    },
    document: {},
    sessionStorage: { clear() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    unescape,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.reject(new Error('Network access is not allowed in cache-key parity tests.'))
  });
  new vm.Script(source, { filename: 'client_api.html#cache-key-test' }).runInContext(context);
  return context;
}

const backend = loadBackendKeyBuilders();
const frontend = loadFrontendKeyBuilders();

test('catalog cache keys stay identical between Apps Script and frontend', () => {
  for (const formType of ['', null, undefined, 'vanChuyen', ' dau ', 'nhân sự']) {
    assert.equal(
      backend.buildCatalogsKey(formType),
      frontend.buildCatalogsKeyForSupabase(formType),
      `Catalog form key drifted for ${String(formType)}`
    );
  }

  for (const sheetName of ['', 'DM_Xe', ' DM_ThamSo_TS ', 'DM_NhânSự']) {
    assert.equal(
      backend.buildCatalogDataKey(sheetName),
      frontend.buildCatalogDataKeyForSupabase(sheetName),
      `Catalog data key drifted for ${sheetName}`
    );
  }
});

test('fund form and catalog cache keys stay identical between Apps Script and frontend', () => {
  for (const year of ['', null, undefined, '2026', ' 2027 ']) {
    assert.equal(
      backend.buildFundFormOptionsKey(year),
      frontend.buildFundFormOptionsKeyForSupabase(year),
      `Fund form-options key drifted for ${String(year)}`
    );
  }

  const cases = [
    ['', ''],
    [null, null],
    ['2026', 'incomeCategories'],
    [' 2027 ', ' expenseCategories '],
    ['2026', 'đối tác']
  ];
  for (const [year, group] of cases) {
    assert.equal(
      backend.buildFundCatalogKey(year, group),
      frontend.buildFundCatalogKeyForSupabase(year, group),
      `Fund catalog key drifted for ${String(year)}/${String(group)}`
    );
  }
});

test('fund month normalization stays identical between Apps Script and frontend', () => {
  const cases = ['', null, undefined, 'latest', 'all', 'Tất cả', '2026-7', '2026-07-15', '7/2026', '07/2026', 'custom'];
  for (const month of cases) {
    assert.equal(
      backend.normalizeFundMonthKey(month),
      frontend.normalizeFundMonthKeyForSupabase(month),
      `Fund month normalization drifted for ${String(month)}`
    );
  }
});

test('fund transaction range/search keys stay identical between Apps Script and frontend', () => {
  const cases = [
    {},
    { limit: 500 },
    { startDate: '2026-07-01', endDate: '2026-07-31', limit: 500 },
    { startDate: '2026-07-01', endDate: '', search: 'Quang Quân', limit: 100 },
    { startDate: '', endDate: '', search: 'xăng dầu/ĐB', limit: 25 }
  ];
  for (const params of cases) {
    assert.equal(
      backend.buildFundTransactionFilterKey(params),
      frontend.buildFundTransactionFilterKeyForSupabase(params),
      `Fund transaction filter key drifted for ${JSON.stringify(params)}`
    );
  }
  assert.equal(backend.buildFundTransactionFilterKey({}), 'recent_500');
});

test('canonical manage month keys match the frontend reader convention', () => {
  for (const monthKey of ['2026-01', '2026-07', '2027-12']) {
    const backendKey = backend.buildManageMonthFilterKey(monthKey);
    const frontendKey = 'month:' + String(monthKey || '').trim();
    assert.equal(backendKey, frontendKey, `Manage month key drifted for ${monthKey}`);
  }
});

test('dashboard and stable filter-key literals remain aligned with the baseline', () => {
  const backendSource = read('SupabaseService.gs');
  const reportSyncSource = read('ReportSyncService.gs');
  const frontendSource = read('client_api.html');
  assert.match(reportSyncSource, new RegExp(`DASHBOARD_REPORT_MONTH = '${baseline.supabase.dashboardReportMonth}'`));
  assert.match(frontendSource, new RegExp(`readReportBundleFromSupabase\\('${baseline.supabase.dashboardReportMonth}'\\)`));
  assert.match(backendSource, /DEFAULT_FUND_TRANSACTION_FILTER_KEY = 'recent_500'/);
  assert.match(frontendSource, /return 'recent_500'/);
  assert.match(frontendSource, /filterKey = 'recent_500'/);
});
