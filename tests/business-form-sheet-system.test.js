const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('all data-entry drawer families opt into the shared business form contract', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(manage, /data-business-form-sheet="entry"/);
  assert.match(manage, /data-business-form-sheet="edit"/);
  assert.match(catalog, /data-business-form-sheet="catalog"/);
  assert.match(cashflow, /id === 'fundTransactionAddDrawer'/);
  assert.match(cashflow, /id === 'fundLoanAddDrawer'/);
  assert.match(cashflow, /id === 'fundLoanPaymentDrawer'/);
  assert.match(cashflow, /data-business-form-sheet=\{isBusinessForm \? 'cashflow' : undefined\}/);
});

test('mobile business forms size to content and share one density scale', () => {
  const css = read('next-shell/app/platform.css');

  assert.match(css, /Business form sheet system \(2026-08-16\)/);
  assert.match(css, /--business-sheet-max-height: 92dvh/);
  assert.match(css, /\[data-business-form-sheet\][\s\S]*?height: auto !important;[\s\S]*?max-height: var\(--business-sheet-max-height\) !important;/);
  assert.match(css, /\.modal-body,[\s\S]*?\.cashflow-drawer-body \{[\s\S]*?flex: 0 1 auto !important;/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /--business-sheet-control-height: 44px/);
  assert.match(css, /#businessFormSpecificityAnchor/);
  assert.match(css, /font-size: 11\.5px !important;[\s\S]*?font-weight: 600 !important;[\s\S]*?text-transform: none !important;/);
  assert.match(css, /font-size: 16px !important;[\s\S]*?font-weight: 500 !important/);
  assert.match(css, /textarea \{[\s\S]*?min-height: 64px !important;[\s\S]*?max-height: 112px !important;/);
  assert.match(css, /\.submit-bar[\s\S]*?min-height: 60px !important;[\s\S]*?env\(safe-area-inset-bottom/);
  assert.match(css, /min-height: 74px !important;[\s\S]*?padding-bottom: max\(22px, calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\)\) !important/);
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*?grid-template-columns: 1fr !important/);
});

test('downward swipe can start on non-interactive blank content only at scroll top', () => {
  const hook = read('next-shell/components/platform/useSwipeDismiss.ts');

  assert.match(hook, /const startedOnBlankContent = direction === 'down'/);
  assert.match(hook, /!target\.closest\(INTERACTIVE_SELECTOR\)/);
  assert.match(hook, /!scrollRegion \|\| scrollRegion\.scrollTop <= 0/);
  assert.match(hook, /!startedOnHandle && !canStartAwayFromHandle && !startedOnBlankContent/);
});
