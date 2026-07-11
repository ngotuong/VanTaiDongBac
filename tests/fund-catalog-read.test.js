const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load() {
  const sandbox = vm.createContext({});
  new vm.Script(read('FundCatalogRepository.gs')).runInContext(sandbox);
  new vm.Script(read('FundCatalogService.gs')).runInContext(sandbox);
  return sandbox;
}
const clean = (value) => String(value == null ? '' : value).trim();
const normalizeHeader = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
const groups = [
  { key: 'incomeCategories', label: 'Mục Thu' }, { key: 'expenseCategories', label: 'Mục Chi' },
  { key: 'actors', label: 'Người Thu/Chi' }, { key: 'partners', label: 'Đối tác' }, { key: 'loanPartners', label: 'Nơi vay' }
];

function context(overrides = {}) {
  const nativeSpecs = { incomeCategories: { rangeName: 'MUCTHU', column: 5, startRow: 3 }, expenseCategories: { rangeName: 'MUCCHI', column: 8, startRow: 3 },
    actors: { column: 15, startRow: 3 }, partners: { column: 13, startRow: 3 }, loanPartners: { column: 11, startRow: 3 } };
  return { clean, normalizeHeader, groups, nativeSpecs, sheetName: 'CAIDAT', ...overrides };
}

test('repository preserves managed rows and resolves named native range bounds', () => {
  const { FundCatalogRepository: repository } = load();
  const sheet = { getLastRow: () => 4, getRange: () => ({ getDisplayValues: () => [['Mục Thu', 'Cước', ''], ['Đối tác', 'Xe 1', 'Ghi chú'], ['', '', '']] }) };
  const rows = repository.readManagedRows(sheet, { clean, normalizeGroup: (value) => value === 'Mục Thu' ? 'incomeCategories' : value === 'Đối tác' ? 'partners' : '' });
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { rowIndex: 2, group: 'Mục Thu', groupKey: 'incomeCategories', value: 'Cước', note: '' },
    { rowIndex: 3, group: 'Đối tác', groupKey: 'partners', value: 'Xe 1', note: 'Ghi chú' }
  ]);
  const spec = repository.resolveNativeSpec({ getRangeByName: () => ({ getColumn: () => 6, getRow: () => 5, getNumRows: () => 8 }) }, { rangeName: 'MUCTHU', column: 5, startRow: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(spec)), { rangeName: 'MUCTHU', column: 6, startRow: 5, endRow: 12 });
});

test('native reader preserves encoded row index, group, source, and native column for all groups', () => {
  const { FundCatalogRepository: repository } = load();
  const values = { 5: ['Thu A'], 8: ['Chi A'], 15: ['An'], 13: ['Xe 1'], 11: ['Ngân hàng'] };
  const sheet = { getLastRow: () => 3, getRange: (row, column) => ({ getDisplayValues: () => (values[column] || []).map((value) => [value]) }) };
  const rows = repository.readNativeRows({ getRangeByName: () => null }, sheet, groups, context().nativeSpecs, clean);
  assert.equal(rows.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => [row.rowIndex, row.groupKey, row.nativeColumn]))), [
    ['native:incomeCategories:3', 'incomeCategories', 5], ['native:expenseCategories:3', 'expenseCategories', 8],
    ['native:actors:3', 'actors', 15], ['native:partners:3', 'partners', 13], ['native:loanPartners:3', 'loanPartners', 11]
  ]);
});

test('catalog service preserves normalization, de-duplication, group counts, filters, and option fallback order', () => {
  const { FundCatalogService: service } = load();
  const rows = [
    { rowIndex: 2, group: 'Mục Thu', groupKey: 'incomeCategories', value: 'Cước', note: '' },
    { rowIndex: 'native:incomeCategories:3', group: 'Mục Thu', groupKey: 'incomeCategories', value: 'CƯỚC', note: '', source: 'native', nativeColumn: 5 },
    { rowIndex: 'native:actors:3', group: 'Người Thu/Chi', groupKey: 'actors', value: 'An', note: '', source: 'native', nativeColumn: 15 }
  ];
  const repository = { readManagedRows: () => rows.slice(0, 1), readNativeRows: () => rows.slice(1) };
  const ctx = context({ repository, spreadsheet: {}, sheet: {}, fallbackIncome: () => ['Cước', 'Khoản vay'], fallbackExpense: () => ['Dầu'],
    fallbackActors: () => ['An', 'Bình'], fallbackPartners: () => ['Xe 1'], fallbackLoanPartners: () => ['Ngân hàng'] });
  assert.equal(service.normalizeGroup('MỤC THU', ctx), 'incomeCategories');
  assert.equal(service.normalizeGroup('người thu/chi', ctx), 'actors');
  const catalog = service.getCatalog('incomeCategories', ctx);
  assert.equal(catalog.rows.length, 2);
  assert.equal(catalog.groups.find((item) => item.key === 'incomeCategories').count, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(service.getFormOptions(ctx))), {
    ok: true, incomeCategories: ['Cước', 'Khoản vay'], expenseCategories: ['Dầu'], actors: ['An', 'Bình'], partners: ['Xe 1'], loanPartners: ['Ngân hàng']
  });
});

test('FundService keeps cache and spreadsheet resolution while delegating catalog read ownership', () => {
  const facade = read('FundService.gs');
  assert.match(facade, /FundCatalogService\.getFormOptions\(context\)/);
  assert.match(facade, /FundCatalogService\.getCatalog\(group, fundCatalogReadContext_/);
  assert.match(facade, /putFundCache_\(optionsCacheKey, result, FUND_CATALOG_TTL_SECONDS\)/);
  assert.match(facade, /putFundCache_\(catalogCacheKey, result, FUND_CATALOG_TTL_SECONDS\)/);
});
