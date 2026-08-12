const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Tài xế builder preserves the explicitly selected Nhóm vận hành dropdown value', () => {
  const context = vm.createContext({});
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#schema-drift' }).runInContext(context);
  new vm.Script(read('ValidationService.gs'), { filename: 'ValidationService.gs#schema-drift' }).runInContext(context);
  const result = context.ValidationService.buildRows('taiXe', [{
    date: '2026-07-24',
    vehicle: '20H05602',
    operationGroup: 'Amata',
    driver: 'Nguyễn Văn A',
    trips: '3,5',
    note: 'Ca tối'
  }], {
    vehicles: [], people: [],
    operationGroups: [{ name: 'Amata' }]
  });
  assert.equal(result.values[0][0].getFullYear(), 2026);
  assert.equal(result.values[0][0].getMonth(), 6);
  assert.equal(result.values[0][0].getDate(), 24);
  assert.deepEqual(plain(result.values[0].slice(1)), [
    '', '20H05602', 'Amata', 'Nguyễn Văn A', 3.5, 'Ca tối'
  ]);
});

test('Tài xế builder requires an explicit Nhóm vận hành selection', () => {
  const context = vm.createContext({});
  new vm.Script(read('NormalizationUtils.gs')).runInContext(context);
  new vm.Script(read('ValidationService.gs')).runInContext(context);
  const row = { date: '2026-07-24', vehicle: '20H05602', driver: 'Nguyễn Văn A', trips: 1 };
  const missing = context.ValidationService.buildRows('taiXe', [row], { vehicles: [], people: [], operationGroups: [] });
  assert.match(missing.errors[0], /Nhom van hanh/);
});

test('Catalog projection stops before a secondary table separated by a blank header', () => {
  const source = {
    ok: true,
    headers: ['STT', 'Biển số xe', 'Công ty sở hữu', '', 'Biển số xe', 'Dự án'],
    rows: [{ rowIndex: 2, values: [1, '20H05602', 'Quang Quân', '', '20H05602', 'Amata 26'] }]
  };
  const context = vm.createContext({
    SheetService: { getCatalogs: () => ({}) },
    SheetReadService: { readSheetData: () => plain(source) },
    ValidationService: { parseNumber: (value) => Number(value) || 0 }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#catalog-schema-drift' }).runInContext(context);
  new vm.Script(read('CatalogService.gs'), { filename: 'CatalogService.gs#schema-drift' }).runInContext(context);
  const result = plain(context.CatalogService.readCatalogData('DM_Xe'));
  assert.deepEqual(result.headers, ['STT', 'Biển số xe', 'Công ty sở hữu']);
  assert.deepEqual(result.rows, [{ rowIndex: 2, values: [1, '20H05602', 'Quang Quân'] }]);
});

test('Personnel catalog hides formula helper columns even when the workbook renames them', () => {
  const source = {
    ok: true,
    headers: ['Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng', 'Dừng thưởng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng', 'Nghỉ chuẩn', 'Trạng Thái', 'Cột 11', 'Công ty'],
    rows: [{ rowIndex: 2, values: ['Nguyễn Hữu Phớt', 'Tài xế', 'Huy', '01/07/2026', '', '28/05/2026', '', 10000000, '', 'Đang làm', 'Đỗ Tường Huân', 'Minh Vương'] }]
  };
  const context = vm.createContext({
    SheetService: { getCatalogs: () => ({}) },
    SheetReadService: { readSheetData: () => plain(source) },
    ValidationService: { parseNumber: (value) => Number(value) || 0 }
  });
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#personnel-helper' }).runInContext(context);
  new vm.Script(read('CatalogService.gs'), { filename: 'CatalogService.gs#personnel-helper' }).runInContext(context);
  const result = plain(context.CatalogService.readCatalogData('DM_NhanSu'));
  assert.deepEqual(result.headers, ['Nhân sự', 'Chức vụ', 'Người tuyển', 'Tính thưởng', 'Dừng thưởng', 'Ngày vào', 'Ngày nghỉ', 'Lương cứng', 'Nghỉ chuẩn', 'Trạng Thái', 'Công ty']);
  assert.deepEqual(result.rows[0].values, ['Nguyễn Hữu Phớt', 'Tài xế', 'Huy', '01/07/2026', '', '28/05/2026', '', 10000000, '', 'Đang làm', 'Minh Vương']);
  assert.doesNotMatch(result.headers.join('|'), /Cột 11|DS_TaiXe_DangLam/);
  const catalogServer = read('next-shell/lib/catalog-server.ts');
  assert.match(catalogServer, /sheetName==='DM_NhanSu'/);
  assert.match(catalogServer, /const indexes=bundle\.headers/);
  assert.match(catalogServer, /visible\.has\(header\)/);
});

test('Catalog writes and deletes are constrained to the visible primary table', () => {
  const sheetService = read('SheetService.gs');
  const catalogModule = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(sheetService, /resolveCatalogEditableColumns_/);
  assert.match(sheetService, /if \(editableColumnMap && !editableColumnMap\[colIdx\]\)/);
  assert.match(sheetService, /if \(String\(rawHeaders\[index\] \|\| ''\)\.trim\(\) === ''\) break/);
  assert.match(catalogModule, /clearColumns\(sheet,editableHeaders\)/);
  assert.match(catalogModule, /return headers\.filter\(Boolean\)/);
  assert.match(catalogModule, /editableHeaders\.map\(header=>/);
});

test('Manage exposes NL_PhanCongLai without routing its add button to another form', () => {
  const manageServer = read('next-shell/lib/manage-server.ts');
  const manageModule = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const manageSync = read('ManageSyncService.gs');
  assert.match(manageServer, /'NL_PhanCongLai'/);
  assert.match(manageModule, /\['NL_PhanCongLai','Phân công lái'\]/);
  assert.match(manageModule, /canCreate=canWrite&&sheet!=='NL_PhanCongLai'/);
  assert.match(manageSync, /'NL_PhanCongLai'/);
});

test('Manage editor protects formulas while keeping live operation-group dropdowns editable', () => {
  const manageModule = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.doesNotMatch(manageModule, /formulaColumn[^\n]*NL_TaiXe[^\n]*nhom van hanh/);
  assert.match(manageModule, /h==='nhom van hanh'\|\|\(sheet==='NL_NghiVanHanh'/);
  assert.match(manageModule, /manageOptions\(header,catalogs,sheet\)/);
  assert.match(manageModule, /sheet==='NL_Dau'&&\['thanh tien','cong ty so huu'\]\.includes\(h\)/);
  assert.match(manageModule, /sheet==='NL_NghiVanHanh'&&\['tinh kpi','giam kpi','kiem tra'\]/);
});
