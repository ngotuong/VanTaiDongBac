const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const CATALOG_GLOBALS = [
  'loadFundCatalog', 'setFundCatalogGroup', 'renderFundCatalog',
  'getFundCatalogGroupLabel', 'openFundCatalogEdit', 'clearFundCatalogForm',
  'saveFundCatalogItem', 'deleteFundCatalogItem', 'showFundCatalogStatus'
];

test('cashflow catalog globals have one frontend owner', () => {
  const files = fs.readdirSync(root).filter((file) => /^client_.*\.html$/.test(file));
  for (const functionName of CATALOG_GLOBALS) {
    const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const owners = files.filter((file) => pattern.test(read(file)));
    assert.deepEqual(owners, ['client_cashflow_catalog.html'], `${functionName} must have one frontend owner`);
  }
});

test('catalog module preserves cache fallback, group, row token, and source contracts', () => {
  const source = read('client_cashflow_catalog.html');
  assert.match(source, /readFundCatalogFromSupabase\('2026', group\)/);
  assert.match(source, /callApi\('GET', 'getFundCatalog'/);
  assert.match(source, /activeFundCatalogGroup/);
  assert.match(source, /encodeURIComponent\(row\.rowIndex/);
  assert.match(source, /row\.source === 'fallback'/);
  assert.match(source, /Từ dữ liệu hiện có/);
});

test('catalog CRUD preserves permissions, payload, confirmation, and option refresh', () => {
  const source = read('client_cashflow_catalog.html');
  assert.match(source, /requireWritePermission\(\)/);
  assert.match(source, /callApi\('POST', 'saveFundCatalogItem'/);
  assert.match(source, /callApi\('POST', 'deleteFundCatalogItem'/);
  assert.match(source, /confirm\('Xóa mục danh mục này\?'\)/);
  assert.match(source, /fundFormOptions = null/);
  assert.match(source, /loadFundFormOptions\(\)/);
  assert.match(source, /loadFundCatalog\(true\)/);
});

test('cashflow catalog fragment loads last among cashflow submodules', () => {
  const template = read('index.template.html');
  const loans = template.indexOf("include('client_cashflow_loans')");
  const catalog = template.indexOf("include('client_cashflow_catalog')");
  assert.ok(loans >= 0 && catalog > loans);
  assert.ok(catalog < template.indexOf("include('client_manage')"));
});
