const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadNumericInput() {
  const source = read('next-shell/lib/platform/numeric-input.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports });
  return module.exports;
}

test('Vietnamese numeric input groups thousands while preserving comma decimals and negatives', () => {
  const { formatVietnameseNumberInput, normalizeVietnameseNumberInput } = loadNumericInput();
  assert.equal(formatVietnameseNumberInput('1234'), '1.234');
  assert.equal(formatVietnameseNumberInput('1234567,5'), '1.234.567,5');
  assert.equal(formatVietnameseNumberInput('-1234567,50'), '-1.234.567,50');
  assert.equal(formatVietnameseNumberInput('1.234.567,5'), '1.234.567,5');
  assert.equal(formatVietnameseNumberInput('1234567', false), '1.234.567');
  assert.equal(formatVietnameseNumberInput('-'), '-');
  assert.equal(normalizeVietnameseNumberInput('10.000.000'), '10000000');
  assert.equal(normalizeVietnameseNumberInput('1.234,5'), '1234.5');
  assert.equal(normalizeVietnameseNumberInput('-1.234.567'), '-1234567');
});

test('Entry, Cashflow, Manage and Catalog apply grouping only to business numeric values', () => {
  const entry = read('next-shell/components/entry/EntryModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(entry, /kind==='number'\?formatVietnameseNumberInput\(value\)/);
  assert.match(cashflow, /formatVietnameseNumberInput\(next,false\)/);
  assert.match(manage, /numericInputHeader\(header\)\?formatVietnameseNumberInput\(value\)/);
  assert.match(manage, /numericInputHeader\(header\)\?normalizeVietnameseNumberInput\(value\):value/);
  assert.match(catalog, /businessHeaderIsNumber\(header,sheet\)\?formatVietnameseNumberInput\(value\)/);
  assert.match(catalog, /businessHeaderIsNumber\(header,sheet\)\?normalizeVietnameseNumberInput\(value\):value/);

});

test('Controls keep the 38px baseline while mobile form text prevents iOS focus zoom', () => {
  const css = read('next-shell/app/platform.css');
  const layout = read('next-shell/app/layout.jsx');
  assert.match(css, /--platform-control-height: 38px;/);
  assert.match(css, /--platform-control-radius: 10px;/);
  assert.match(css, /--platform-control-font-size: 14\.5px;/);
  assert.match(
    css,
    /Cross-module UI audit lock[\s\S]*body :is\(#entryShell, \.view, \.fund-detail-drawer, \.modal-container, \.catalog-modal, \.drawer-content\)[\s\S]*height: var\(--platform-control-height\) !important;[\s\S]*font-size: var\(--platform-control-font-size\) !important;/,
  );
  assert.match(css, /Mobile input zoom guard[\s\S]*font-size: 16px !important/);
  assert.doesNotMatch(layout, /maximumScale|userScalable/);
});

test('Every module search input has a final 16px mobile Safari zoom lock', () => {
  const css = read('next-shell/app/platform.css');
  const components = [
    read('next-shell/components/report/ReportModule.tsx'),
    read('next-shell/components/manage/ManageReadOnlyModule.tsx'),
    read('next-shell/components/catalog/CatalogModule.tsx'),
    read('next-shell/components/cashflow/CashflowModule.tsx'),
  ];
  for (const source of components) assert.match(source, /type="search"/);
  assert.match(
    css,
    /Final mobile search zoom lock[\s\S]*@media \(max-width: 768px\)[\s\S]*html body input\[type='search'\][\s\S]*#platform-content[\s\S]*#reportsView[\s\S]*#manageView[\s\S]*#catalogView[\s\S]*#cashflowView[\s\S]*font-size: 16px !important/,
  );
  assert.ok(css.lastIndexOf('Final mobile search zoom lock') > css.lastIndexOf('#reportSearchInput'));
});

test('Every application table keeps Report detail row density with the larger readable fonts', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(css, /--platform-table-head-font-size: 13px;/);
  assert.match(css, /--platform-table-body-font-size: 14px;/);
  assert.match(css, /--platform-table-cell-padding: 8px 12px;/);
  assert.match(css, /Cross-module UI audit lock[\s\S]*table th \{[\s\S]*padding: var\(--platform-table-cell-padding\) !important;[\s\S]*font-size: var\(--platform-table-head-font-size\) !important;/);
  assert.match(css, /Cross-module UI audit lock[\s\S]*table td \{[\s\S]*padding: var\(--platform-table-cell-padding\) !important;[\s\S]*font-size: var\(--platform-table-body-font-size\) !important;/);
  assert.match(css, /Cross-module UI audit lock[\s\S]*\.fund-export-value,[\s\S]*font-size: var\(--platform-table-body-font-size\) !important/);
  assert.match(css, /body \.manage-c2 \.report-table \.btn-table-action,[\s\S]*height: 32px !important/);
});

test('Dashboard profit month filter uses the shared 38px and 14.5px control standard', () => {
  const css = read('next-shell/app/platform.css');
  assert.match(
    css,
    /body \.dashboard-module-kpis \.dashboard-kpi-card \.kpi-hero-select \{[\s\S]*height: var\(--platform-control-height\) !important;[\s\S]*min-height: var\(--platform-control-height\) !important;[\s\S]*font-size: var\(--platform-control-font-size\) !important;/,
  );
});
