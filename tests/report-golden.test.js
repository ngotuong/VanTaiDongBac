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
        aggregateOverviewDetailMatrices: aggregateOverviewDetailMatrices_
      },`
    + source.slice(returnIndex + '  return {'.length);

  const context = vm.createContext({ console });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#report-golden-test' }).runInContext(context);
  new vm.Script(read('ValidationService.gs'), { filename: 'ValidationService.gs#report-golden-test' }).runInContext(context);
  new vm.Script(source, { filename: 'SheetService.gs#report-golden-test' }).runInContext(context);
  return context.SheetService.__reportGoldenTest;
}

function loadFrontendReportFunctions() {
  const source = read('client_reports.html')
    .replace(/^\s*<script[^>]*>/i, '')
    .replace(/<\/script>\s*$/i, '');
  const context = vm.createContext({ console, window: {} });
  new vm.Script(source, { filename: 'client_reports.html#report-golden-test' }).runInContext(context);
  return context;
}

const backend = loadBackendReportFunctions();
const frontend = loadFrontendReportFunctions();

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

test('frontend overview parser preserves distinct month labels and KPI values', () => {
  const parsed = plain(frontend.parseOverview(fixture.overviewMonths));
  assert.deepEqual(parsed.rows.map((row) => row.month), ['05/2026', '06/2026', '07/2026']);
  assert.deepEqual(parsed.rows.map((row) => row.revenue), [1000, 2000, 3000]);
  assert.deepEqual(parsed.rows.map((row) => row.payroll), [50, 100, 150]);
  assert.deepEqual(parsed.rows.map((row) => row.final), [560, 1120, 1680]);
  assert.equal(parsed.latest.month, '07/2026');
});

test('detail KPI parsing matches each golden month and selects outside-fuel explanation', () => {
  const expected = {
    '05/2026': { gross: 680, final: 560, cashCost: 120, fuelOut: 30, payroll: 50, fund: 40, totalCost: 120 },
    '06/2026': { gross: 1360, final: 1120, cashCost: 240, fuelOut: 60, payroll: 100, fund: 80, totalCost: 240 },
    '07/2026': { gross: 2040, final: 1680, cashCost: 360, fuelOut: 90, payroll: 150, fund: 120, totalCost: 360 }
  };
  for (const [month, matrix] of Object.entries(fixture.detailMatrices)) {
    assert.deepEqual(plain(backend.parseOverviewKpiDetails(matrix)), expected[month], `Detail KPI drifted for ${month}`);
  }
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
