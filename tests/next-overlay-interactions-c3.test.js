const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('C3 audits every business overlay as a body-level portal or fixed shell',()=>{
  const cashflow=read('next-shell/components/cashflow/CashflowModule.tsx');
  const manage=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  const catalog=read('next-shell/components/catalog/CatalogModule.tsx');
  for(const source of [cashflow,manage,catalog])assert.match(source,/createPortal\(children,\s*document\.body\)/);
  for(const id of ['fundTransactionAddDrawer','fundLoanAddDrawer','fundLoanPaymentDrawer','fundCategoryDetailDrawer'])assert.match(cashflow,new RegExp(id));
  assert.match(manage,/data-overlay-scroll="manage"/);
  assert.match(catalog,/data-overlay-scroll="catalog"/);
  assert.match(cashflow,/data-overlay-scroll="cashflow"/);
  assert.match(catalog,/catalog-modal-open/);
});

test('C3 gives every mobile business overlay one explicit vertical pan region',()=>{
  const css=read('next-shell/app/c2-golden.css');
  assert.doesNotMatch(css,/(?:^|\n)\s*\.cashflow-c2 \{[^}]*display:\s*block/);
  assert.match(css,/body > \.cashflow-c2\.fund-detail-drawer \{[^}]*display: flex[^}]*flex-direction: column[^}]*min-height: 0/);
  assert.match(css,/\.cashflow-c2 \.cashflow-drawer-body \{[^}]*flex: 1 1 0%[^}]*height: 0[^}]*min-height: 0[^}]*overflow-y: auto !important[^}]*touch-action: pan-y[^}]*-webkit-overflow-scrolling: touch/);
  assert.match(css,/\.cashflow-c2 \.cashflow-drawer-body > \.table-wrap \{[^}]*overflow-x: auto !important[^}]*overflow-y: visible !important/);
  assert.match(css,/body > \.modal-overlay \.modal-body \{[^}]*overflow-y: auto !important[^}]*touch-action: pan-y[^}]*-webkit-overflow-scrolling: touch/);
  assert.match(css,/body\.mobile-entry-open #entryShell \.entry-rows \{[^}]*overflow-y: auto !important[^}]*touch-action: pan-y[^}]*-webkit-overflow-scrolling: touch/);
  assert.match(css,/@media \(max-width: 640px\) \{[\s\S]*?body > \.cashflow-c2\.fund-detail-drawer \{[^}]*height: 100dvh !important[^}]*max-height: 100dvh !important/);
});

test('C3 keeps overlay actions visible above the mobile safe area',()=>{
  const css=read('next-shell/app/c2-golden.css');
  assert.match(css,/\.cashflow-c2 > \.modal-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css,/body > \.modal-overlay \.modal-footer \{[^}]*safe-area-inset-bottom/);
  assert.match(css,/body\.mobile-entry-open #entryShell \.submit-bar \{[^}]*safe-area-inset-bottom/);
  assert.match(css,/body\.catalog-modal-open \.bottom-nav/);
});
