const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Tài xế builder keeps the new Dự án column before Tài xế and Số chuyến', () => {
  const context = vm.createContext({});
  new vm.Script(read('NormalizationUtils.gs'), { filename: 'NormalizationUtils.gs#schema-drift' }).runInContext(context);
  new vm.Script(read('ValidationService.gs'), { filename: 'ValidationService.gs#schema-drift' }).runInContext(context);
  const result = context.ValidationService.buildRows('taiXe', [{
    date: '2026-07-24',
    vehicle: '20H05602',
    project: 'Amata 26',
    driver: 'Nguyễn Văn A',
    trips: '3,5',
    note: 'Ca tối'
  }], { vehicles: [], projects: [], people: [] });
  assert.equal(result.values[0][0].getFullYear(), 2026);
  assert.equal(result.values[0][0].getMonth(), 6);
  assert.equal(result.values[0][0].getDate(), 24);
  assert.deepEqual(plain(result.values[0].slice(1)), [
    '', '20H05602', 'Amata 26', 'Nguyễn Văn A', 3.5, 'Ca tối'
  ]);
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

test('Catalog writes and deletes are constrained to the visible primary table', () => {
  const sheetService = read('SheetService.gs');
  const catalogModule = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(sheetService, /resolveCatalogEditableColumns_/);
  assert.match(sheetService, /if \(editableColumnMap && !editableColumnMap\[colIdx\]\)/);
  assert.match(sheetService, /if \(String\(rawHeaders\[index\] \|\| ''\)\.trim\(\) === ''\) break/);
  assert.match(catalogModule, /clearColumns\(sheet,data\.headers\)/);
  assert.match(catalogModule, /return headers\.filter\(Boolean\)/);
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
