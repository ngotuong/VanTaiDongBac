const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('desktop correction is isolated from the approved mobile layout', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /Desktop UI correction checkpoint \(2026-07-30\)/);
  assert.match(css, /@media \(min-width: 1025px\)/);
  assert.match(css, /\.manage-entry-embedded\.swipe-dismiss-surface \{[\s\S]*height: auto !important;[\s\S]*max-height: min\(88dvh, 820px\) !important;/);
  assert.match(css, /#fundTransactionAddDrawer\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface,[\s\S]*height: min\(72dvh, 620px\) !important;[\s\S]*max-height: min\(72dvh, 620px\) !important;/);
  assert.match(css, /\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface \.cashflow-drawer-body \{[\s\S]*flex: 1 1 auto !important;/);
});

test('desktop business forms slide from below and settle in the viewport center', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /\.manage-entry-embedded\.swipe-dismiss-surface \{[\s\S]*top: 50% !important;[\s\S]*left: 50% !important;[\s\S]*transform: translate3d\(-50%, calc\(-50% \+ var\(--drawer-swipe-offset\)\), 0\) !important;/);
  assert.match(css, /body > \.modal-overlay\.side-drawer-overlay \{[\s\S]*align-items: center !important;/);
  assert.match(css, /#fundTransactionAddDrawer\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface,[\s\S]*top: 50% !important;[\s\S]*left: 50% !important;[\s\S]*transform: translate3d\(-50%, calc\(-50% \+ var\(--drawer-swipe-offset\)\), 0\) !important;/);
  assert.match(css, /@starting-style \{[\s\S]*calc\(-50% \+ 100dvh\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('desktop entry exposes every form type in one compact row', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /\.manage-entry-embedded #entryShell \.form-list \{[\s\S]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) !important;/);
  assert.match(css, /\.manage-entry-embedded #entryShell \.form-tab-note \{[\s\S]*display: none !important;/);
});

test('desktop date controls render only one native value', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /\.manage-filter-panel \.cashflow-date-input \.date-display-text,[\s\S]*display: none !important;/);
  assert.match(css, /\.manage-filter-panel \.cashflow-date-input \.native-date-input,[\s\S]*position: static !important;[\s\S]*opacity: 1 !important;/);
  assert.match(css, /html body \.cashflow-c2 \.cashflow-overview-filter-panel \.cashflow-date-input input\.native-date-input,[\s\S]*position: static !important;[\s\S]*opacity: 1 !important;/);
});

test('wide desktop tables and tab bars expose their scroll affordance', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /\.report-module-table-wrap,[\s\S]*\.manage-table-scroll,[\s\S]*scrollbar-gutter: stable;/);
  assert.match(css, /#reportTabsBar, #catalogTabsBar, #manageTabsBar,[\s\S]*scrollbar-width: thin !important;/);
  assert.match(css, /::-webkit-scrollbar \{[\s\S]*height: 6px !important;/);
});

test('loan payment action has an explicit desktop label', () => {
  const module = read('next-shell/components/cashflow/CashflowModule.tsx');
  const css = read('next-shell/app/platform.css');

  assert.match(module, /<span className="desktop-action-label">Thanh toán<\/span>/);
  assert.match(css, /\.desktop-action-label \{\s*display: none;/);
  assert.match(css, /\.fund-loan-payment-icon \.desktop-action-label \{[\s\S]*display: inline !important;/);
});
