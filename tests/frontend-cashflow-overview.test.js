const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stripScript = (source) => source.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');

const OVERVIEW_GLOBALS = [
  'renderFundKpiLoading',
  'loadFundOverview',
  'getFundGrowth',
  'renderFundOverview',
  'renderFundOverviewMonthFilter',
  'renderFundCategoryRows',
  'renderFundFinancialReportCard',
  'exportFundFinancialReport',
  'renderFundDetailRows',
  'showFundCategoryDetail'
];

test('cashflow overview/report globals have one frontend owner', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of OVERVIEW_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_cashflow_overview.html'], `${functionName} must have one frontend owner`);
  }
});

test('cashflow overview keeps API, cache fallback, report, export, and detail contracts', () => {
  const source = read('client_cashflow_overview.html');
  assert.match(source, /readFundOverviewFromSupabase\('2026', month\)/);
  assert.match(source, /callApi\('GET', 'getFundOverview'/);
  assert.match(source, /fundOverviewData = data/);
  assert.match(source, /renderFundCategoryRows\('fundIncomeCategoryBody'/);
  assert.match(source, /renderFundCategoryRows\('fundExpenseCategoryBody'/);
  assert.match(source, /exportCardAsImage\(exportBtn, 'ThuChi'\)/);
  assert.match(source, /fundCategoryDetailCard/);
  assert.match(source, /document\.body\.classList\.add\('locked'\)/);
});

test('fund growth calculation preserves direction, inversion, and empty baseline behavior', () => {
  const context = vm.createContext({ console, window: {} });
  new vm.Script(stripScript(read('client_cashflow_overview.html')), { filename: 'client_cashflow_overview.html' }).runInContext(context);

  assert.deepEqual({ ...context.getFundGrowth(120, 100) }, { text: '▲ 20%', statusClass: 'ok' });
  assert.deepEqual({ ...context.getFundGrowth(120, 100, true) }, { text: '▲ 20%', statusClass: 'err' });
  assert.deepEqual({ ...context.getFundGrowth(80, 100) }, { text: '▼ 20%', statusClass: 'err' });
  assert.deepEqual({ ...context.getFundGrowth(10, 0) }, { text: '-', statusClass: 'ok' });
});

test('cashflow overview fragment loads immediately after facade', () => {
  const template = read('index.template.html');
  const facadeIndex = template.indexOf("include('client_cashflow')");
  const overviewIndex = template.indexOf("include('client_cashflow_overview')");
  assert.ok(facadeIndex >= 0 && overviewIndex > facadeIndex);
  assert.ok(overviewIndex < template.indexOf("include('client_manage')"));
});
