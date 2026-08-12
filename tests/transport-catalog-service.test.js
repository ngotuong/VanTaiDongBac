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
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rowCount, columnCount) {
    const values = Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? ''));
    return { getValues: () => values, getDisplayValues: () => values.map((item) => item.map(String)) };
  }
}

function loadService(sheetRows) {
  const sheets = Object.fromEntries(Object.entries(sheetRows).map(([name, rows]) => [name, new FakeSheet(rows)]));
  const context = vm.createContext({
    SheetService: { getCatalogs: () => { throw new Error('Facade delegation is not used by readCatalogs tests.'); } },
    SheetReadService: {},
    ValidationService: { parseNumber: (value) => Number(value) || 0 }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#catalog-test' }).runInContext(context);
  new vm.Script(read('CatalogService.gs'), { filename: 'CatalogService.gs#test' }).runInContext(context);
  return { service: context.CatalogService, ss: { getSheetByName: (name) => sheets[name] || null } };
}

const sheetRows = {
  DM_NhanSu: [
    ['Tên', 'Vai trò', 'Người tuyển', '', '', '', '', '', '', 'Trạng thái'],
    [' An ', 'Tài xế', 'Bình', '', '', '', '', '', '', 'Đang làm'],
    ['Nghỉ', 'Điều hành', '', '', '', '', '', '', '', 'Đã nghỉ']
  ],
  DM_Xe: [
    ['Mã', 'Biển số', '', '', '', 'Trạng thái', '', 'Chủ xe'],
    ['X1', '30A-001', '', '', '', 'Đang chạy', '', 'Đông Bắc'],
    ['X2', '30A-002', '', '', '', 'Dừng', '', 'Đối tác']
  ],
  DM_DuAn: [['Dự án', 'Km'], ['Mỏ A', 12.5]],
  DM_PhatNoiBo: [['Mã', 'Nội dung', 'Số tiền', 'Trạng thái'], ['P01', 'Đi muộn', 100000, 'Đang áp dụng']],
  DM_ThamSo: [['Mã', 'Tên', 'Giá trị'], ['KPI', 'Mức KPI', 25]],
  NL_ChamCong: [
    ['', '', '', '', '', '', '', '', '', 'Loại'],
    ['', '', '', '', '', '', '', '', '', 'Ngày công'],
    ['', '', '', '', '', '', '', '', '', 'Ngày công'],
    ['', '', '', '', '', '', '', '', '', 'Nghỉ phép']
  ],
  NL_Dau: [
    [],
    ['Ngày', 'Tháng', 'Biển số', 'Nguồn dầu', '', '', '', 'Nguồn chi'],
    ['', '', '', 'Quang Minh', '', '', '', 'Quang Quân'],
    ['', '', '', 'Đổ ngoài', '', '', '', 'Quỹ']
  ],
  NL_NghiVanHanh: [
    ['Ngày', 'Tháng', 'Biển số xe', 'Dự án', 'Loại nghỉ'],
    ['', '', '', '', 'Mỏ báo nghỉ']
  ],
  SYS_DanhSach: [
    ['DS_NhomVanHanh'],
    ['Tràng Duệ'],
    ['Amata'],
    ['Dự án nhỏ']
  ]
};

test('catalog reader preserves the full baseline payload and active filters', () => {
  const { service, ss } = loadService(sheetRows);
  const result = plain(service.readCatalogs(ss, ''));
  assert.deepEqual(result.activeVehicles.map((item) => item.plate), ['30A-001']);
  assert.deepEqual(result.activePeople.map((item) => item.name), ['An']);
  assert.deepEqual(result.activeDrivers.map((item) => item.name), ['An']);
  assert.deepEqual(result.projects, [{ name: 'Mỏ A', distanceKm: 12.5 }]);
  assert.deepEqual(result.operationGroups.map((item) => item.name), ['Tràng Duệ', 'Amata', 'Dự án nhỏ']);
  assert.deepEqual(result.activePenalties.map((item) => item.code), ['P01']);
  assert.deepEqual(result.params, { KPI: 25 });
  assert.deepEqual(result.chamCongTypes.map((item) => item.name), ['Ngày công', 'Nghỉ phép']);
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.fuelSources, ['Quang Minh', 'Đổ ngoài']);
  assert.deepEqual(result.fuelPaymentSources, ['Quang Quân', 'Quỹ']);
  assert.deepEqual(result.nghiVanHanhTypes, ['Mỏ báo nghỉ']);
});

test('catalog form needs remain narrow and unknown forms fall back to the full set', () => {
  const { service, ss } = loadService(sheetRows);
  const transport = plain(service.readCatalogs(ss, 'vanChuyen'));
  assert.equal(transport.vehicles.length, 2);
  assert.equal(transport.projects.length, 1);
  assert.equal(transport.people.length, 0);
  assert.deepEqual(transport.params, {});

  const attendance = plain(service.readCatalogs(ss, 'chamCong'));
  assert.equal(attendance.people.length, 2);
  assert.equal(attendance.vehicles.length, 0);
  assert.equal(attendance.chamCongTypes.length, 2);

  const drivers = plain(service.readCatalogs(ss, 'taiXe'));
  assert.equal(drivers.vehicles.length, 2);
  assert.equal(drivers.people.length, 2);
  assert.equal(drivers.projects.length, 1);
  assert.deepEqual(drivers.assignments, []);

  const fallback = plain(service.readCatalogs(ss, 'unknown'));
  assert.equal(fallback.people.length, 2);
  assert.equal(fallback.vehicles.length, 2);
  assert.equal(fallback.projects.length, 1);
  assert.equal(fallback.penalties.length, 1);
});

test('CatalogService owns transport catalog implementation while SheetService retains cache orchestration only', () => {
  const catalog = read('CatalogService.gs');
  const sheet = read('SheetService.gs');
  assert.match(catalog, /function readCatalogs\(ss, formType\)/);
  assert.match(sheet, /CatalogService\.readCatalogs\(getSpreadsheet_\(\), formType\)/);
  assert.doesNotMatch(sheet, /function catalogNeeds_/);
  assert.doesNotMatch(sheet, /function readChamCongTypes_/);
  assert.doesNotMatch(sheet, /function readParams_/);
});

test('fuel price catalog exposes only live input columns and protects the delta formula', () => {
  const source = read('CatalogService.gs');
  assert.match(source, /DM_GiaDau:\s*\['Ngày áp dụng', 'Giá dầu áp dụng'\]/);
  assert.doesNotMatch(source, /DM_GiaDau:\s*\[[^\]]*'Ghi chú'/);
});
