const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/report-golden.synthetic.json'));
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadBackendReportFunctions() {
  let source = read('SheetService.gs');
  const returnIndex = source.lastIndexOf('  return {');
  assert.ok(returnIndex >= 0, 'Could not locate SheetService public return object.');
  source = source.slice(0, returnIndex)
    + `  return { __reportGoldenTest: {
        readOverviewKpisFromMonthTable: readOverviewKpisFromMonthTable_,
        parseOverviewKpiDetails: parseOverviewKpiDetails_,
        aggregateOverviewDetailMatrices: aggregateOverviewDetailMatrices_,
        repairOverviewQuantityDisplay: repairOverviewQuantityDisplay_
      },`
    + source.slice(returnIndex + '  return {'.length);

  const context = vm.createContext({ console });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#report-golden-test' }).runInContext(context);
  new vm.Script(read('ValidationService.gs'), { filename: 'ValidationService.gs#report-golden-test' }).runInContext(context);
  new vm.Script(read('DashboardService.gs'), { filename: 'DashboardService.gs#report-golden-test' }).runInContext(context);
  new vm.Script(source, { filename: 'SheetService.gs#report-golden-test' }).runInContext(context);
  return context.SheetService.__reportGoldenTest;
}

const backend = loadBackendReportFunctions();

test('synthetic golden fixture contains distinct month values and no production payload marker', () => {
  assert.equal(fixture.fixtureType, 'synthetic');
  assert.deepEqual(fixture.expectedKpis.map((row) => row.month), ['05/2026', '06/2026', '07/2026']);
  assert.equal(new Set(fixture.expectedKpis.map((row) => row.revenue)).size, 3);
  assert.equal(new Set(fixture.expectedKpis.map((row) => row.payroll)).size, 3);
});

test('Apps Script KPI parsing matches the golden month outputs', () => {
  const actual = plain(backend.readOverviewKpisFromMonthTable(fixture.overviewMonths));
  assert.deepEqual(actual, fixture.expectedKpis);
});

test('payroll matching uses the explicit salary column and never the volume column', () => {
  const actual = plain(backend.readOverviewKpisFromMonthTable(fixture.overviewMonths));
  assert.deepEqual(actual.map((row) => row.payroll), [50, 100, 150]);
  assert.notDeepEqual(actual.map((row) => row.payroll), [5000, 7000, 9000]);
});

test('detail KPI parsing matches each golden month and selects outside-fuel explanation', () => {
  const expected = {
    '05/2026': { gross: 680, final: 560, cashCost: 120, fuelOut: 30, payroll: 50, bhxh: 0, fund: 40, totalCost: 120 },
    '06/2026': { gross: 1360, final: 1120, cashCost: 240, fuelOut: 60, payroll: 100, bhxh: 0, fund: 80, totalCost: 240 },
    '07/2026': { gross: 2040, final: 1680, cashCost: 360, fuelOut: 90, payroll: 150, bhxh: 0, fund: 120, totalCost: 360 }
  };
  for (const [month, matrix] of Object.entries(fixture.detailMatrices)) {
    assert.deepEqual(plain(backend.parseOverviewKpiDetails(matrix)), expected[month], `Detail KPI drifted for ${month}`);
  }
});

test('dashboard KPI parsing carries non-zero BHXH in both month and detail payloads', () => {
  const monthMatrix = [
    ['Tháng', 'Doanh thu', 'Lợi nhuận gộp', 'Dầu ngoài', 'Chi phí lương', 'BHXH', 'Chi quỹ', 'Lợi nhuận thực'],
    ['07/2026', 1200, 1000, 50, 100, 25, 75, 750]
  ];
  const [month] = plain(backend.readOverviewKpisFromMonthTable(monthMatrix));
  assert.equal(month.bhxh, 25);

  const detail = plain(backend.parseOverviewKpiDetails([
    ['Danh mục', 'Tổng', '', '', 'Giải thích'],
    ['Lợi nhuận gộp', 1000, '', '', ''],
    ['Chi phí dầu', 50, '', '', 'Đổ ngoài'],
    ['Chi phí lương', 100, '', '', ''],
    ['BHXH', 25, '', '', ''],
    ['Chi quỹ thực tế', 75, '', '', ''],
    ['Lợi nhuận thực', 750, '', '', '']
  ]));
  assert.equal(detail.bhxh, 25);
  assert.equal(detail.final, 750);
});

test('all-period detail aggregation matches the golden sum and keeps source labels', () => {
  const matrices = ['05/2026', '06/2026', '07/2026'].map((month) => fixture.detailMatrices[month]);
  const actual = plain(backend.aggregateOverviewDetailMatrices(matrices));
  assert.deepEqual(actual, fixture.expectedAllDetails);
});

test('removing the explicit payroll header does not allow Khối lượng to become payroll', () => {
  const matrix = fixture.overviewMonths.map((row) => row.slice(0, 11));
  const actual = plain(backend.readOverviewKpisFromMonthTable(matrix));
  assert.deepEqual(actual.map((row) => row.payroll), [50, 100, 150]);
  assert.notDeepEqual(actual.map((row) => row.payroll), [5000, 7000, 9000]);
});

test('overview quantity display recovers the numeric serial when a Sheet cell is accidentally formatted as month/year', () => {
  const repaired = plain(backend.repairOverviewQuantityDisplay(
    [['Tháng', 'Tổng khối lượng', 'Tổng doanh thu'], ['08/2026', '04/1906', '100.000']],
    [['Tháng', 'Tổng khối lượng', 'Tổng doanh thu'], ['08/2026', new Date(1906, 3, 4, 6, 14, 24), 100000]]
  ));
  assert.deepEqual(repaired, [
    ['Tháng', 'Tổng khối lượng', 'Tổng doanh thu'],
    ['08/2026', '2.286,26', '100.000']
  ]);
});

test('DashboardService owns month resolution and KPI parsing while SheetService keeps compatibility wrappers', () => {
  const context = vm.createContext({ Utilities: { formatDate: () => '2026-07' } });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#dashboard-owner-test' }).runInContext(context);
  new vm.Script(read('ValidationService.gs'), { filename: 'ValidationService.gs#dashboard-owner-test' }).runInContext(context);
  new vm.Script(read('DashboardService.gs'), { filename: 'DashboardService.gs#owner-test' }).runInContext(context);
  const service = context.DashboardService;
  assert.deepEqual(plain(service.getActiveReportMonths(fixture.overviewMonths)), ['05/2026', '06/2026', '07/2026']);
  assert.equal(service.resolveReportMonth(fixture.overviewMonths, 'latest'), '07/2026');
  assert.equal(service.resolveReportMonth(fixture.overviewMonths, '06/2026'), '06/2026');

  const source = read('SheetService.gs');
  assert.match(source, /DashboardService\.parseMonthKpis/);
  assert.match(source, /DashboardService\.parseDetailKpis/);
  assert.match(source, /DashboardService\.resolveReportMonth/);
  assert.match(source, /DashboardService\.aggregateDetailMatrices/);
  assert.doesNotMatch(source, /function readDetailNumber_/);
  assert.doesNotMatch(source, /function hasDetailFormulaError_/);
  assert.doesNotMatch(source, /function formatAggregateDetailCell_/);
});
