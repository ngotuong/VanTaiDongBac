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

test('B6 shares manage-data boundary and reads every fund cache server-first with fallback',()=>{
  const route=read('next-shell/app/manage-data/route.ts');const server=read('next-shell/lib/cashflow-server.ts');
  assert.match(route,/surface.*cashflow/);assert.match(route,/loadCashflowSurface/);
  for(const table of ['fund_overview_bundles','fund_transaction_bundles','fund_loan_bundles','catalog_bundles'])assert.match(server,new RegExp(table));
  for(const action of ['getFundOverview','getFundTransactions','getFundLoanOverview','getFundFormOptions','getFundCatalog'])assert.match(server,new RegExp(`'${action}'`));
  assert.match(server,/resolve\(\{module:'cashflow',year\}\)/);assert.match(server,/month:\$\{month\}/);assert.match(server,/recent_500/);
  assert.doesNotMatch(server,/getActiveSpreadsheet|NEXT_PUBLIC_.*SERVICE/);
});

test('B6 preserves transaction queue idempotency pending overlay and direct row identity',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');
  for(const action of ['addFundTransactions','getRecentWriteJobs','getWriteJobStatus','retryWriteJob','processWriteJobs','updateFundTransaction','deleteFundTransaction'])assert.match(source,new RegExp(`'${action}'`));
  for(const status of ['pending','processing','synced','failed'])assert.match(source,new RegExp(status));
  assert.match(source,/useQueue:true/);assert.match(source,/clientRequestId:requestId\(\)/);assert.match(source,/voucher/);assert.match(source,/rowIndex/);assert.match(source,/pending:true/);
});

test('B6 keeps loan reconciliation payload and native catalog row bounds owned by Apps Script',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');
  for(const action of ['addFundLoan','addFundLoanPayment','saveFundCatalogItem','deleteFundCatalogItem'])assert.match(source,new RegExp(`'${action}'`));
  for(const field of ['currentOutstanding','isCurrentlySettled','loanKey','reconciledFromCode'])assert.match(source,new RegExp(field));
  assert.match(source,/payload:\{group,rowIndex:catalogEdit\.rowIndex/);assert.match(source,/payload:\{rowIndex:row\.rowIndex\}/);
  const catalog=read('FundCatalogService.gs');const repository=read('FundCatalogRepository.gs');
  assert.match(catalog,/assertBounds/);assert.match(repository,/clearContent\(\)/);assert.doesNotMatch(source,/deleteRow|clearContent|native:\([^)]*\)/);
});

test('B6 applies existing RBAC: shareholder reads cashflow but cannot see fund catalog writes',()=>{
  const source=read('next-shell/components/cashflow/CashflowModule.tsx');const registry=read('ApiActionRegistry.gs');
  assert.match(source,/context\.user\.role==='admin'\|\|context\.user\.role==='operator'/);assert.match(source,/canWrite\?\[\['catalog'/);
  for(const action of ['getFundOverview','getFundTransactions','getFundLoanOverview'])assert.match(registry,new RegExp(`${action}: \\{ method: 'GET', kind: 'query', permission: 'shareholder'`));
  assert.match(registry,/getFundCatalog: \{ method: 'GET', kind: 'query', permission: 'adminOperator'/);
});

test('fund cache repository scopes exact server-side keys and credentials',async()=>{
  const {createFundBundleRepository}=require('../server/repositories/fund-bundle-repository.js');let request;
  const repository=createFundBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>[{payload:{ok:true},synced_at:'2026-07-13T00:00:00Z'}]};}});
  await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'secret'},'fund_transaction_bundles',{year:'2026',filter_key:'month:2026-07'});
  const url=new URL(request.url);assert.equal(url.pathname,'/rest/v1/fund_transaction_bundles');assert.equal(url.searchParams.get('year'),'eq.2026');assert.equal(url.searchParams.get('filter_key'),'eq.month:2026-07');assert.equal(request.options.headers.Authorization,'Bearer secret');
});

test('B6 cashflow UI keeps accessible touch targets and responsive horizontal tables',()=>{
  const css=read('next-shell/app/platform.css');
  assert.match(css,/\.cashflow-module button\{min-height:44px/);assert.match(css,/\.cashflow-table-wrap\{[^}]*overflow:auto/);assert.match(css,/\.cashflow-modal[^}]*max-height/);assert.match(css,/@media\(max-width:640px\)/);
});
