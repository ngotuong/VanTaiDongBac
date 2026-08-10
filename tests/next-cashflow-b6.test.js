const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('B6 exposes one independent Next cashflow route without a legacy bridge',()=>{
  const page=read('next-shell/app/cashflow/page.jsx');const module=read('next-shell/components/cashflow/CashflowModule.tsx');
  assert.match(page,/loadCashflowInitial/);assert.match(page,/CashflowModule/);
  assert.doesNotMatch(module,/google\.script|window\.appData|bridge=|components\/Cashflow/);
  for(const tab of ['overview','transactions','loans','catalog'])assert.match(module,new RegExp(`'${tab}'`));
});

test('B6 resolves cashflow workbook context from the matched Next route',()=>{
  const context=read('next-shell/lib/request-context.js');
  assert.match(context,/x-matched-path/);assert.match(context,/\/\^\\\/cashflow/);assert.match(context,/\? 'cashflow' : input\.module/);
});

test('B6 shares manage-data boundary and reads every fund cache Supabase-first with explicit force fallback',()=>{
  const route=read('next-shell/app/manage-data/route.ts');const server=read('next-shell/lib/cashflow-server.ts');
  assert.match(route,/surface.*cashflow/);assert.match(route,/loadCashflowSurface/);
  for(const table of ['fund_overview_bundles','fund_transaction_bundles','fund_loan_bundles','catalog_bundles'])assert.match(server,new RegExp(table));
  for(const action of ['getFundOverview','getFundTransactions','getFundLoanOverview','getFundFormOptions','getFundCatalog'])assert.match(server,new RegExp(`'${action}'`));
  assert.match(server,/resolve\(\{module:'cashflow',year\}\)/);assert.match(server,/month:\$\{month\}/);assert.match(server,/recent_500/);
  assert.doesNotMatch(server,/getActiveSpreadsheet|NEXT_PUBLIC_.*SERVICE/);
});

test('B6 serves range filters and keeps ordinary Fund catalog reads on Supabase',()=>{
  const server=read('next-shell/lib/cashflow-server.ts');
  assert.match(server,/createFundRangeService/);
  assert.match(server,/buildOverviewRange/);
  assert.match(server,/mergeTransactionBundles/);
  assert.match(server,/buildLoansRange/);
  assert.match(server,/catalogCacheVersion==='fund_catalog_v2'/);
  assert.match(server,/surface==='range'/);
  assert.match(server,/contiguousCachedRows\(rows\)/);
  assert.match(server,/catalogFromOptions/);
  assert.match(server,/fund_form_options:\$\{year\}/);
  assert.match(server,/Cache Quỹ theo khoảng ngày trên Supabase chưa đầy đủ/);
  assert.match(server,/if\(input\.forceRefresh\)return fallback\(\)/);
  assert.match(server,/getFundFormOptions'.*forceRefresh:'true'/);
  assert.match(server,/getFundCatalog'.*forceRefresh:input\.forceRefresh\?'true':''/);
});

test('B6 preserves transaction queue idempotency pending overlay and direct row identity',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');
  for(const action of ['addFundTransactions','getRecentWriteJobs','getWriteJobStatus','retryWriteJob','processWriteJobs','updateFundTransaction','deleteFundTransaction'])assert.match(source,new RegExp(`'${action}'`));
  for(const status of ['pending','processing','synced','failed'])assert.match(source,new RegExp(status));
  assert.match(source,/useQueue:\s*true/);assert.match(source,/clientRequestId:\s*requestId\(\)/);assert.match(source,/voucher/);assert.match(source,/rowIndex/);assert.match(source,/pending:\s*true/);
});

test('B6 keeps loan reconciliation payload and native catalog row bounds owned by Apps Script',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');
  for(const action of ['addFundLoan','addFundLoanPayment','saveFundCatalogItem','deleteFundCatalogItem'])assert.match(source,new RegExp(`'${action}'`));
  for(const field of ['currentOutstanding','isCurrentlySettled','loanKey','reconciledFromCode'])assert.match(source,new RegExp(field));
  assert.match(source,/payload:\s*\{[\s\S]*?group,[\s\S]*?rowIndex:\s*catalogEdit\.rowIndex/);assert.match(source,/payload:\s*\{\s*rowIndex:\s*row\.rowIndex\s*\}/);
  const catalog=read('FundCatalogService.gs');const repository=read('FundCatalogRepository.gs');
  assert.match(catalog,/assertBounds/);assert.match(repository,/clearContent\(\)/);assert.doesNotMatch(source,/deleteRow|clearContent|native:\([^)]*\)/);
});

test('B6 applies existing RBAC: shareholder reads cashflow but cannot see fund catalog writes',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');const registry=read('ApiActionRegistry.gs');
  assert.match(source,/context\.user\.role\s*===\s*'admin'\s*\|\|\s*context\.user\.role\s*===\s*'operator'/);assert.match(source,/canWrite\s*\?\s*\[\['catalog'/);
  for(const action of ['getFundOverview','getFundTransactions','getFundLoanOverview'])assert.match(registry,new RegExp(`${action}: \\{ method: 'GET', kind: 'query', permission: 'shareholder'`));
  assert.match(registry,/getFundCatalog: \{ method: 'GET', kind: 'query', permission: 'adminOperator'/);
});

test('fund cache repository scopes exact server-side keys and credentials',async()=>{
  const {createFundBundleRepository}=require('../server/repositories/fund-bundle-repository.js');let request;
  const repository=createFundBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>[{payload:{ok:true},synced_at:'2026-07-13T00:00:00Z'}]};}});
  await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'secret'},'fund_transaction_bundles',{year:'2026',filter_key:'month:2026-07'});
  const url=new URL(request.url);assert.equal(url.pathname,'/rest/v1/fund_transaction_bundles');assert.equal(url.searchParams.get('year'),'eq.2026');assert.equal(url.searchParams.get('filter_key'),'eq.month:2026-07');assert.equal(request.options.headers.Authorization,'Bearer secret');
  await repository.upsert({supabaseUrl:'https://cache.test',serviceRoleKey:'secret'},'catalog_bundles',{catalog_key:'fund_catalog:2026:partners',payload:{ok:true}},'catalog_key');
  assert.equal(request.options.method,'POST');assert.equal(request.options.headers.Prefer,'resolution=merge-duplicates,return=minimal');
  assert.deepEqual(JSON.parse(request.options.body),[{catalog_key:'fund_catalog:2026:partners',payload:{ok:true}}]);
});

test('C3 Cashflow restores the C2 golden surface instead of the rejected redesign',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');const css=read('next-shell/app/c2-golden.css');
  assert.match(source,/id="cashflowView" className="view active cashflow-c2"/);
  for(const token of ['fundTabsBar','sub-tabs-bar app-sticky-tabs','fund-kpi-grid','fund-export-card','cashflow-filter-search-input','fund-transactions-scroll','fund-loan-history-head','fund-catalog-chips','fund-catalog-form','fundTransactionAddDrawer','fundLoanPaymentDrawer','fundCategoryDetailDrawer'])assert.match(source,new RegExp(token));
  for(const label of ['Tổng quan','Danh sách thu chi','Khoản vay','Danh mục','Báo cáo thu chi','TỔNG THU TRONG KỲ','Số dư hiện tại','Người Thu/Chi','Nơi vay'])assert.match(source,new RegExp(label));
  assert.match(source,/const PAGE_SIZE = 20/);assert.match(source,/startDate && date < startDate/);assert.match(source,/exportCardAsImage/);assert.match(source,/Trả gốc/);
  assert.doesNotMatch(source,/className="cashflow-module"|cashflow-header|cashflow-modal-backdrop|cashflow-card/);
  assert.match(css,/\.cashflow-c2 \.cashflow-icon-button \{ min-width: 44px/);assert.match(css,/\.cashflow-drawer-backdrop \{ display: block/);assert.match(css,/@media \(max-width: 640px\)/);
});

test('C3 Cashflow drawers cannot open the application sidebar and render above fixed navigation',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');const shell=read('next-shell/components/platform/AppShell.tsx');const css=read('next-shell/app/c2-golden.css');
  assert.match(source,/createPortal\(children, document\.body\)/);assert.match(source,/cashflow-modal-open/);assert.doesNotMatch(source,/classList\.toggle\('drawer-open'/);
  assert.match(shell,/shell-drawer-open/);assert.doesNotMatch(shell,/classList\.toggle\('drawer-open'/);
  assert.match(css,/body\.shell-drawer-open \.sidebar/);assert.match(css,/\.cashflow-drawer-backdrop \{ display: block; z-index: 990/);assert.match(css,/body > \.cashflow-c2\.fund-detail-drawer \{ z-index: 1000; display: flex/);
});

test('Cashflow category and input drawers share accessible bottom-sheet swipe dismissal',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');const css=read('next-shell/app/platform.css');
  const gesture=read('next-shell/components/platform/useSwipeDismiss.ts');
  assert.match(source,/useSwipeDismiss/);
  assert.match(source,/swipe-dismiss-surface/);
  assert.match(source,/data-swipe-dismiss-handle/);
  assert.match(source,/fund-view-icon-button/);
  assert.match(source,/aria-label=\{`Xem chi tiết \$\{row\.category\}`\}/);
  assert.match(source,/<circle cx="12" cy="12" r="3"\s*\/>/);
  assert.match(gesture,/INTERACTIVE_SELECTOR/);
  assert.match(gesture,/direction = 'down'/);
  assert.match(gesture,/startedAtEdge/);
  assert.match(gesture,/classList\.add\('dragging'\)/);
  assert.doesNotMatch(gesture,/setIsDragging/);
  assert.match(css,/body > \.cashflow-c2\.fund-detail-drawer\.swipe-dismiss-surface/);
  assert.match(css,/animation: none !important/);
  assert.match(css,/translate3d\(0,100%,0\)/);
  assert.match(css,/\.fund-view-icon-button/);
});
