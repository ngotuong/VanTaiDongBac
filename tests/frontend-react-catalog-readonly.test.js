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

test('legacy Catalog island remains read-only unless its independent write flag is enabled', () => {
  const legacy = read('client_catalog.html');
  const component = read('next-shell/components/CatalogReadOnly.jsx');
  assert.match(legacy, /if \(!window\.__REACT_CATALOG_READONLY_ACTIVE/);
  assert.match(component, /writeEnabled &&/);
  assert.doesNotMatch(component, /openManageEditModal|deleteManageRow|Thao tác/);
  assert.match(read('next-shell/app/catalog/page.jsx'), /CatalogModule/);
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

test('Next shell exports the independent B5 Catalog route while retaining the island build for rollback', () => {
  assert.match(read('next-shell/app/catalog/page.jsx'), /<CatalogModule/);
  assert.match(read('next-shell/app/catalog/page.jsx'), /loadCatalogData/);
  assert.match(read('package.json'), /build-catalog-react\.js/);
});

test('React Catalog filter and pagination preserve legacy IDs, page size, and callbacks', () => {
  const component = read('next-shell/components/CatalogReadOnly.jsx');
  const entry = read('react-catalog/entry.jsx');
  const legacy = read('client_catalog.html');
  for (const id of ['catalogSearchInput', 'catalogPersonnelStatusFilterWrap', 'catalogPersonnelStatusFilter', 'catalogVehicleOwnerFilterWrap', 'catalogVehicleOwnerFilter', 'catalogPaginationBar', 'catalogPaginationInfo', 'catalogPrevPageBtn', 'catalogNextPageBtn']) assert.match(component, new RegExp(`id="${id}"`));
  for (const callback of ['debounceCatalogSearch', 'filterCatalogRows', 'changeCatalogPage']) assert.match(entry, new RegExp(`window\\.${callback}`));
  assert.match(legacy, /const catalogPageSize = 20/);
  assert.match(legacy, /personnelStatus !== 'all'/);
  assert.match(legacy, /row\.owner !== vehicleOwner/);
});

test('React Catalog write controls require a second independent flag and preserve legacy CRUD rowIndex', () => {
  const component = read('next-shell/components/CatalogReadOnly.jsx');
  const entry = read('react-catalog/entry.jsx');
  const legacy = read('client_catalog.html');
  assert.match(component, /writeEnabled &&/);
  assert.match(component, /openCatalogAddModal/);
  assert.match(component, /data-write-only="true"/);
  assert.match(entry, /__REACT_CATALOG_WRITE_ACTIVE = enabled\(window\.__REACT_CATALOG_WRITE_ENABLED\)/);
  assert.match(legacy, /__REACT_CATALOG_WRITE_ACTIVE/);
  assert.match(legacy, /openManageEditModal\(row\)/);
  assert.match(legacy, /deleteManageRow\(row\.rowIndex\)/);
  assert.match(read('.env.example'), /VITE_REACT_CATALOG_WRITE_ENABLED=false/);
});
