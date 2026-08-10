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
  const { formatVietnameseNumberInput } = loadNumericInput();
  assert.equal(formatVietnameseNumberInput('1234'), '1.234');
  assert.equal(formatVietnameseNumberInput('1234567,5'), '1.234.567,5');
  assert.equal(formatVietnameseNumberInput('-1234567,50'), '-1.234.567,50');
  assert.equal(formatVietnameseNumberInput('1.234.567,5'), '1.234.567,5');
  assert.equal(formatVietnameseNumberInput('1234567', false), '1.234.567');
  assert.equal(formatVietnameseNumberInput('-'), '-');
});

test('Entry, Cashflow and Manage apply grouping only to business numeric values', () => {
  const entry = read('next-shell/components/entry/EntryModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(entry, /key === 'tickets' \|\| kind === 'number' \? 'decimal'/);
  assert.match(entry, /kind === 'number' \? formatVietnameseNumberInput\(e\.target\.value\)/);
  assert.match(cashflow, /formatVietnameseNumberInput\(event\.target\.value, false\)/);
  assert.match(manage, /numeric\?formatVietnameseNumberInput\(event\.target\.value\)/);
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
