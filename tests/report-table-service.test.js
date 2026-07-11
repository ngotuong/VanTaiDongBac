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
  assert.equal(result.vehicles[0].length, 12);
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
  assert.doesNotMatch(source, /function readTable_/);
});
