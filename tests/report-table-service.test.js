const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

class FakeSheet {
  constructor(rows) { this.rows = rows; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map((row) => row.length)); }
  getRange(row, column, rowCount, columnCount) {
    const values = Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? ''));
    return { getDisplayValues: () => values.map((item) => item.map(String)) };
  }
}

function loadService(rowsBySheet) {
  const sheets = Object.fromEntries(Object.entries(rowsBySheet).map(([name, rows]) => [name, new FakeSheet(rows)]));
  const context = vm.createContext({});
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#report-table-test' }).runInContext(context);
  new vm.Script(read('ReportTableService.gs'), { filename: 'ReportTableService.gs#test' }).runInContext(context);
  return { service: context.ReportTableService, ss: { getSheetByName: (name) => sheets[name] || null } };
}

test('report table reader preserves exact dimensions, header, row order, and removes empty body rows', () => {
  const payroll = [[], ['Tháng', 'Nhân sự'], ['07/2026', 'An'], ['', ''], ['06/2026', 'Bình']];
  const vehicles = [[], ['Tháng', 'Xe'], ['07/2026', '30A']];
  const { service, ss } = loadService({ BC_BangLuong: payroll, BC_TongHopXe: vehicles });
  const result = plain(service.readTables(ss));
  assert.deepEqual(result.payroll.map((row) => row.slice(0, 2)), [
    ['Tháng', 'Nhân sự'], ['07/2026', 'An'], ['06/2026', 'Bình']
  ]);
  assert.deepEqual(result.vehicles.map((row) => row.slice(0, 2)), [
    ['Tháng', 'Xe'], ['07/2026', '30A']
  ]);
  assert.equal(result.payroll[0].length, 16);
  assert.equal(result.vehicles[0].length, 14);
});

test('report table reader exposes both sections of BC_TongHopDuAn independently', () => {
  const projectReport = [
    [],
    ['Tháng', 'Công ty', 'Nhóm báo cáo', 'Số chuyến', 'Tổng khối lượng', 'Doanh thu', 'Tỷ trọng doanh thu', '', 'Tháng', 'Công ty', 'Nhóm báo cáo', 'Dự án', 'Số chuyến', 'Tổng khối lượng', 'Doanh thu'],
    ['08/2026', 'Quang Quân', 'Tràng Duệ', '10', '100', '200', '100%', '', '08/2026', 'Quang Quân', 'Tràng Duệ', 'Tràng Duệ 42', '10', '100', '200']
  ];
  const { service, ss } = loadService({ BC_TongHopDuAn: projectReport });
  const result = plain(service.readTables(ss));
  assert.deepEqual(result.projectGroups[0], projectReport[1].slice(0, 7));
  assert.deepEqual(result.projects[0], projectReport[1].slice(8, 15));
  assert.deepEqual(result.projects[1], projectReport[2].slice(8, 15));
});

test('report table reader does not truncate payroll after 200 rows', () => {
  const payroll = [[], ['Tháng', 'Nhân sự']];
  for (let index = 1; index <= 240; index++) payroll.push(['08/2026', `Nhân sự ${index}`]);
  payroll.push(['', '']);
  const { service, ss } = loadService({ BC_BangLuong: payroll, BC_TongHopXe: [[], ['Tháng', 'Xe']] });
  const result = plain(service.readTables(ss));
  assert.equal(result.payroll.length, 241);
  assert.equal(result.payroll.at(-1)[1], 'Nhân sự 240');
});

test('report freshness reader includes the monthly overview matrix', () => {
  const overview = [['', '', '', '', '', '', 'Tháng', 'Doanh thu'], ['', '', '', '', '', '', '08/2026', '100']];
  const { service, ss } = loadService({ BC_TongQuan: overview, BC_BangLuong: [[], ['Tháng', 'Nhân sự']], BC_TongHopXe: [[], ['Tháng', 'Xe']] });
  const result = plain(service.readFreshnessTables(ss));
  assert.deepEqual(result.overview.slice(0, 2).map((row) => row.slice(0, 2)), [['Tháng', 'Doanh thu'], ['08/2026', '100']]);
});

test('report table month filter preserves header, source order, all behavior, and empty-key fallback', () => {
  const { service } = loadService({});
  const matrix = [['Tháng', 'Giá trị'], ['06/2026', 1], ['07/2026', 2], ['07/2026', 3]];
  const normalize = (value) => String(value || '').trim().replace(/^(\d{2})\/(\d{4})$/, '$2-$1');
  assert.deepEqual(plain(service.filterByMonth(matrix, '07/2026', normalize)), [
    ['Tháng', 'Giá trị'], ['07/2026', 2], ['07/2026', 3]
  ]);
  assert.deepEqual(plain(service.filterByMonth(matrix, 'Tất cả', normalize)), matrix);
  assert.deepEqual(plain(service.filterByMonth(matrix, '', normalize)), matrix);
});

test('SheetService delegates report table read/filter but retains cache orchestration', () => {
  const source = read('SheetService.gs');
  assert.match(source, /ReportTableService\.readTables\(ss\)/);
  assert.match(source, /ReportTableService\.filterByMonth/);
  assert.match(source, /putChunkedCache_\(cacheKey, tables, REPORT_TTL_SECONDS\)/);
  assert.match(source, /var reportTables = readReportTables_\(ss, forceRefresh\)/);
  assert.doesNotMatch(source, /readReportTables_\(ss, forceRefresh && !requestOptions\.skipInvalidation\)/);
  assert.doesNotMatch(source, /function readTable_/);
});
