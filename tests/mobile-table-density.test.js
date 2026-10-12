const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'next-shell/app/platform.css'), 'utf8');
const tableComponents = new Map([
  ['next-shell/components/dashboard/DashboardModule.tsx', '[data-next-dashboard="true"]'],
  ['next-shell/components/report/ReportModule.tsx', '#reportsView'],
  ['next-shell/components/report/PayrollExplanationDialog.tsx', '.payroll-explanation-modal'],
  ['next-shell/components/manage/ManageReadOnlyModule.tsx', '#manageView'],
  ['next-shell/components/catalog/CatalogModule.tsx', '#catalogView'],
  ['next-shell/components/cashflow/CashflowModule.tsx', '#cashflowView'],
  ['next-shell/components/settings/SettingsModule.tsx', '#settingsView'],
]);

function sourceFilesWithTables(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesWithTables(file);
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) return [];
    return fs.readFileSync(file, 'utf8').includes('<table') ? [path.relative(root, file)] : [];
  });
}

test('every table component is registered in the shared mobile density contract', () => {
  const actual = sourceFilesWithTables(path.join(root, 'next-shell/components')).sort();
  const expected = [...tableComponents.keys()].sort();

  assert.deepEqual(actual, expected);
  for (const [file, surface] of tableComponents) {
    assert.match(css, new RegExp(surface.replace(/[\[\]"]/g, '\\$&')), `${file} is missing from the density selector`);
  }
});

test('mobile tables share one tokenized compact density without changing export captures', () => {
  const checkpoint = css.slice(css.indexOf('/* Mobile table and card density contract (2026-09-12).'));

  assert.match(checkpoint, /@media \(max-width: 768px\)/);
  for (const surface of ['#reportsView', '[data-next-dashboard="true"]', '#manageView', '#catalogView', '#cashflowView', '#settingsView']) {
    assert.match(checkpoint, new RegExp(surface.replace(/[\[\]"]/g, '\\$&')));
  }
  assert.match(css, /--platform-mobile-table-head-padding: 6px 8px;/);
  assert.match(css, /--platform-mobile-table-cell-padding: 6px 8px;/);
  assert.match(checkpoint, /:is\(\.table-card:not\(\.is-exporting\), \.account-users-wrap\) table th \{[\s\S]*padding: var\(--platform-mobile-table-head-padding\) !important;[\s\S]*font-size: var\(--platform-mobile-table-head-font-size\) !important;/);
  assert.match(checkpoint, /:is\(\.table-card:not\(\.is-exporting\), \.account-users-wrap\) table td:not\(\[colspan\]\) \{[\s\S]*padding: var\(--platform-mobile-table-cell-padding\) !important;[\s\S]*font-size: var\(--platform-mobile-table-cell-font-size\) !important;/);
  assert.doesNotMatch(checkpoint, /\.is-exporting\) table[^\n]*padding:/);
});

test('mobile card title rows use the shared compact height while export captures stay unchanged', () => {
  const checkpoint = css.slice(css.indexOf('/* Mobile table and card density contract (2026-09-12).'));

  assert.match(css, /--platform-mobile-card-head-height: 40px;/);
  assert.match(css, /--platform-mobile-card-head-padding: 4px 10px;/);
  assert.match(checkpoint, /\.table-card:not\(\.is-exporting\) > \.table-card-head \{[\s\S]*min-height: var\(--platform-mobile-card-head-height\) !important;[\s\S]*padding: var\(--platform-mobile-card-head-padding\) !important;/);
  assert.match(css, /\.table-card\.is-exporting \.table-card-head,[\s\S]*min-height: 48px !important;/);
});

test('card-header filters use one tokenized vertical-alignment contract', () => {
  const cashflow = fs.readFileSync(path.join(root, 'next-shell/components/cashflow/CashflowModule.tsx'), 'utf8');
  const report = fs.readFileSync(path.join(root, 'next-shell/components/report/ReportModule.tsx'), 'utf8');
  const checkpoint = css.slice(css.indexOf('/* Mobile table and card density contract (2026-09-12).'));

  assert.match(css, /--platform-card-head-control-height: 40px;/);
  assert.match(cashflow, /fund-loan-summary-head[\s\S]*data-card-head-controls="true"/);
  assert.match(cashflow, /fund-loan-history-filters" data-card-head-controls="true"/);
  assert.match(report, /data-card-head-controls=\{placement === 'desktop'/);
  assert.match(checkpoint, /> \[data-card-head-controls\] \{[\s\S]*align-self: center !important;[\s\S]*min-height: var\(--platform-card-head-control-height\) !important;/);
});

test('mobile card subhead filters use the shared balanced one-or-two-column contract', () => {
  const checkpoint = css.slice(css.indexOf('/* Mobile table and card density contract (2026-09-12).'));

  assert.match(checkpoint, /#platform-content \.table-card:not\(\.is-exporting\) > \.table-card-subhead \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*justify-content: stretch !important;/);
  assert.match(checkpoint, /> \.table-card-subhead:has\(> :only-child\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(checkpoint, /> \.table-card-subhead > \.compact-filter,[\s\S]*> \.table-card-subhead select\.platform-content-select \{[\s\S]*width: 100% !important;[\s\S]*min-width: 0 !important;/);
  assert.match(checkpoint, /> \.table-card-subhead[\s\S]*select\.platform-content-select\.platform-content-select\[data-adaptive-filter="selected"\] \{[\s\S]*width: 100% !important;[\s\S]*max-width: none !important;[\s\S]*flex: 1 1 auto !important;[\s\S]*justify-self: stretch !important;/);
});

test('compact action rows retain 44px touch targets without extra cell padding', () => {
  const checkpoint = css.slice(css.indexOf('/* Mobile table and card density contract (2026-09-12).'));

  assert.match(checkpoint, /td:is\(\.sticky-col-right, \.manage-row-actions, \.catalog-row-actions\) \{[\s\S]*padding-block: 0 !important;/);
  assert.match(checkpoint, /\.btn-table-action,[\s\S]*\.cashflow-debt-pay-btn \{[\s\S]*min-width: 44px !important;[\s\S]*min-height: 44px !important;/);
  assert.match(checkpoint, /td\.report-payroll-explanation-action-cell,[\s\S]*td\.fund-export-action \{[\s\S]*padding-block: 0 !important;/);
  assert.match(checkpoint, /\.fund-view-icon-button \{[\s\S]*width: 24px !important;[\s\S]*height: 24px !important;/);
  assert.match(checkpoint, /\.fund-view-icon-button::before \{[\s\S]*inset: -10px;/);
});

test('debt settlement is icon-only with an accessible name', () => {
  const module = fs.readFileSync(path.join(root, 'next-shell/components/cashflow/CashflowModule.tsx'), 'utf8');
  const button = module.match(/<button type="button" className="btn-table-action cashflow-debt-pay-btn[\s\S]*?<\/button>/)?.[0] || '';

  assert.match(button, /aria-label=\{`Thanh toán công nợ/);
  assert.match(button, /title="Thanh toán công nợ"/);
  assert.match(button, /<svg className="btn-svg"/);
  assert.doesNotMatch(button, />\s*Thanh toán\s*</);
});

test('payroll explanation keeps report-density rows with a 24px eye and a 44px hit target', () => {
  const report = fs.readFileSync(path.join(root, 'next-shell/components/report/ReportModule.tsx'), 'utf8');
  const dialog = fs.readFileSync(path.join(root, 'next-shell/components/report/PayrollExplanationDialog.tsx'), 'utf8');

  assert.match(report, /className="report-payroll-explanation-button"/);
  assert.match(report, /M2 12s3\.5-6 10-6/);
  assert.match(report, /aria-label=\{`Xem giải trình lương của/);
  assert.match(report, /data-export-hidden/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-label="Xuất ảnh giải trình lương"/);
  assert.match(css, /\.report-payroll-explanation-button \{[\s\S]*width: 24px;[\s\S]*height: 24px;/);
  assert.match(css, /\.report-payroll-explanation-button::before \{[^}]*inset: -10px;/);
  assert.match(css, /\.report-payroll-explanation-action-cell \{[^}]*width: 40px;[^}]*padding: 0 2px !important;/);
  assert.match(report, /prepared\.head\.map\(\(cell, index\) => <th[\s\S]*showPayrollExplanation \? <th[\s\S]*report-payroll-explanation-head/);
  assert.match(report, /prepared\.head\.map\(\(header, index\) => <td[\s\S]*showPayrollExplanation \? <td className="report-payroll-explanation-action-cell"/);
  assert.doesNotMatch(report, /type === 'payroll' && index === 0 \? <(?:th|td)/);
});

test('mobile tables reduce horizontal travel without shrinking touch targets', () => {
  const density = css.slice(css.indexOf('/* Shared horizontal-density rules.'));

  assert.match(density, /table th \{[\s\S]*white-space: normal !important;/);
  assert.match(density, /report-data-table-payroll[\s\S]*report-payroll-explanation-action-cell \{[\s\S]*width: 40px !important;[\s\S]*max-width: 40px !important;/);
  assert.doesNotMatch(density, /table\.report-data-table-payroll :is\(th, td\):last-child[\s\S]*max-width: 168px/);
});

test('mobile loan summary removes status-cell padding while preserving its 44px payment target', () => {
  const module = fs.readFileSync(path.join(root, 'next-shell/components/cashflow/CashflowModule.tsx'), 'utf8');
  assert.match(module, /className="table-card cashflow-loan-summary"/);
  assert.match(css, /\.cashflow-loan-summary\.table-card:not\(\.is-exporting\) table td\.fund-loan-status-cell \{[\s\S]*padding-block: 0 !important;/);
  assert.match(css, /\.table-card:not\(\.is-exporting\) table \.btn-table-action,[\s\S]*min-height: 44px !important;/);
});
