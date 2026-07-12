const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sheets = ['DM_NhanSu', 'DM_Xe', 'DM_DuAn', 'DM_LuongChuyen', 'DM_ThamSo_TS', 'DM_ThamSo_GD', 'DM_DonGiaVanChuyen', 'DM_ThuongQuanLy', 'DM_PhatNoiBo'];

test('React Catalog read-only slice preserves every dynamic and virtual sheet tab', () => {
  const component = read('next-shell/components/CatalogReadOnly.jsx');
  for (const sheet of sheets) assert.match(component, new RegExp(`'${sheet}'`));
  for (const id of ['catalogTabsBar', 'catalogSheetSelect', 'catalogTable', 'catalogTableHeader', 'catalogTableBody', 'catalogTableEmpty']) assert.match(component, new RegExp(`id="${id}"`));
  assert.match(component, /setCatalogSheetTab/);
});

test('Catalog read-only client preserves GET action, display sheet, and force-refresh parameters', () => {
  const client = read('next-shell/lib/catalog-client.js');
  assert.match(client, /transport\('GET', 'readCatalogData'/);
  assert.match(client, /\{ displaySheetName, forceRefresh: forceRefresh \? 'true' : '' \}/);
});

test('Catalog read-only canary removes all transport Catalog write controls', () => {
  const legacy = read('client_catalog.html');
  const component = read('next-shell/components/CatalogReadOnly.jsx');
  assert.match(legacy, /if \(!window\.__REACT_CATALOG_READONLY_ACTIVE\)/);
  assert.doesNotMatch(component, /openCatalogAddModal|openManageEditModal|deleteManageRow|Thêm dòng mới|Thao tác/);
  assert.match(legacy, /row\.rowIndex/);
});

test('Catalog read-only canary defaults off and keeps legacy rollback', () => {
  const entry = read('react-catalog/entry.jsx');
  const template = read('index.template.html');
  assert.match(entry, /if \(!enabled\(window\.__REACT_CATALOG_READONLY_ENABLED\)\) return false/);
  assert.match(entry, /window\.__REACT_CATALOG_READONLY_ACTIVE = true/);
  assert.match(entry, /legacy\.remove\(\)/);
  assert.match(template, /catalogLegacyRoot/);
  assert.match(template, /catalogReactRoot/);
  assert.match(template, /catalog-react\.js/);
  assert.match(read('.env.example'), /VITE_REACT_CATALOG_READONLY_ENABLED=false/);
  assert.match(read('client_catalog.html'), /function loadCatalogSheetData/);
});

test('Next shell statically exports the Catalog read-only canary route', () => {
  assert.match(read('next-shell/app/catalog/page.jsx'), /<CatalogReadOnly/);
  assert.match(read('package.json'), /build-catalog-react\.js/);
});
