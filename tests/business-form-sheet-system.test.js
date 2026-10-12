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
  assert.match(cashflow, /id === 'fundDebtPaymentDrawer'/);
  assert.match(cashflow, /id === 'fundLoanAddDrawer'/);
  assert.match(cashflow, /id === 'fundLoanPaymentDrawer'/);
  assert.match(cashflow, /data-business-form-sheet=\{isBusinessForm \? 'cashflow' : undefined\}/);
});

test('terminal responsive contract prevents mobile and desktop drawer divergence', () => {
  const css = read('next-shell/app/platform.css');
  const terminal = css.slice(css.indexOf('/* R5 business form and density contract (2026-09-29).'));
  assert.match(terminal, /--business-form-compact-width: 680px/);
  assert.match(terminal, /--business-form-standard-width: 840px/);
  assert.match(terminal, /--business-form-wide-width: 920px/);
  assert.match(terminal, /@media \(max-width: 560px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
  assert.match(terminal, /\.custom-date-box > \.native-date-input[^{}]*\{[\s\S]*?position: absolute !important;[\s\S]*?opacity: 0 !important;/);
  assert.match(terminal, /\.custom-date-box \.date-display-text[^{}]*\{[\s\S]*?display: block !important;/);
});

test('project catalog alias contract never drops its identity fields', () => {
  const service = read('CatalogService.gs');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(service, /DM_DuAn: \[[\s\S]*?\['Tên dự án', 'Dự án'\],[\s\S]*?\['Số km', 'Km', 'Cự ly'\]/);
  for (const field of ["['Từ ngày', 'Hiệu lực từ']", "['Đến ngày', 'Hiệu lực đến']", "['Nhóm vận hành']", "['Áp dụng lương chuyến?', 'Lương chuyến?']", "['Áp dụng thưởng QL?', 'Thưởng QL?']", "['Ghi chú']"]) {
    assert.ok(service.includes(field), `missing project input alias ${field}`);
  }
  assert.match(service, /return headers\.find\(function \(header\)/);
  assert.match(catalog, /'luong chuyen\?','thuong ql\?','ap dung luong chuyen\?','ap dung thuong ql\?'/);
  assert.match(catalog, /const numericHeader=businessHeaderIsNumber/);
});

test('business forms center in the viewport, size to content and share one density scale', () => {
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
  assert.match(css, /Centered business form contract \(2026-09-24\)/);
  assert.match(css, /top: 50% !important;[\s\S]*?left: 50% !important;/);
  assert.match(css, /width: min\(920px, calc\(100vw - 24px\)\) !important;/);
  assert.match(css, /transform: translate3d\(-50%, calc\(-50% \+ var\(--drawer-swipe-offset, 0px\)\), 0\) !important;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?width: calc\(100vw - 20px\) !important;/);
});

test('downward swipe starts only on the explicit header handle', () => {
  const hook = read('next-shell/components/platform/useSwipeDismiss.ts');

  assert.match(hook, /target\.closest\('\[data-swipe-dismiss-handle\]'\)/);
  assert.match(hook, /if \(!startedOnHandle && !canStartAwayFromHandle\) return/);
  assert.doesNotMatch(hook, /startedOnBlankContent/);
  assert.match(hook, /direction === 'down' && scrollRegion && scrollRegion\.scrollTop > 0/);
});

test('dirty business forms confirm every user dismissal and bypass the guard only after save', () => {
  const hook = read('next-shell/components/platform/useSwipeDismiss.ts');
  const guard = read('next-shell/components/platform/unsaved-form.ts');
  const entry = read('next-shell/components/entry/EntryModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');

  assert.match(hook, /canDismiss\?: \(\) => boolean/);
  assert.match(hook, /forceClose: \(\) => finishClose\(true\)/);
  assert.match(guard, /window\.confirm\(DISCARD_MESSAGE\)/);
  assert.match(entry, /onDirtyChange\?\.\(dirty\)/);
  assert.match(entry, /onSubmitted\) onSubmitted\(\{ form, rows: submittedRows \}\)/);
  assert.match(manage, /acceptEntrySubmission\(submission\);entrySwipe\.forceClose\(\)/);
  assert.match(manage, /canDismiss:\(\)=>confirmDiscardUnsavedChanges\(entryDirty\)/);
  assert.match(manage, /editSwipe\.forceClose\(\)/);
  assert.match(catalog, /canDismiss:\(\)=>confirmDiscardUnsavedChanges\(formDirty\)/);
  assert.match(catalog, /formSwipe\.forceClose\(\)/);
  assert.match(cashflow, /canDismiss: \(\) => confirmDiscardUnsavedChanges\(dirty\)/);
  assert.match(cashflow, /dismissDisabled=\{busy\}/);
});

test('all business date controls expose a native picker behind a Vietnamese date display', () => {
  const entry = read('next-shell/components/entry/EntryModule.tsx');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  const cashflow = read('next-shell/components/cashflow/CashflowModule.tsx');

  for (const source of [entry, manage, catalog, cashflow]) assert.match(source, /BusinessFieldControl/);
  const primitive = read('next-shell/components/platform/BusinessPrimitives.tsx');
  const css = read('next-shell/components/platform/business-primitives.module.css');
  assert.match(primitive, /type="date"/);
  assert.match(primitive, /aria-hidden="true"/);
  assert.match(css, /\.dateBox \.dateNative[^{}]*\{[^}]*opacity: 0/);

});

test('edit form failures stay inside the open form instead of being hidden on the page', () => {
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  for (const source of [manage, catalog]) {
    assert.match(source, /className="business-form-error" role="alert" aria-live="assertive"/);
    assert.match(source, /setFormError\(message\)/);
  }
});

test('catalog and manage write drawers trap focus and support Escape', () => {
  const hook = read('next-shell/components/platform/useDialogFocusTrap.ts');
  const manage = read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog = read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(hook, /event\.key !== 'Tab'/);
  assert.match(hook, /previous\?\.focus\(\)/);
  assert.match(manage, /useDialogFocusTrap<HTMLElement>/);
  assert.match(manage, /ref=\{entryDialogRef\} tabIndex=\{-1\}/);
  assert.match(manage, /ref=\{editDialogRef\} tabIndex=\{-1\}/);
  assert.match(catalog, /ref=\{formDialogRef\} tabIndex=\{-1\}/);
});

test('fund write drawer positioning covers debt payment as well as the three older drawers', () => {
  const css = read('next-shell/app/platform.css');
  const terminal = css.slice(css.indexOf('/* R5 business form and density contract'));
  assert.match(terminal, /:is\(#fundTransactionAddDrawer, #fundDebtPaymentDrawer, #fundLoanAddDrawer, #fundLoanPaymentDrawer\)\.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface\[data-business-form-sheet\]/);
  assert.match(terminal, /z-index: 99999 !important/);
  assert.match(terminal, /top: 50% !important/);
  assert.match(terminal, /left: 50% !important/);
});
