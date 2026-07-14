const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname,'..');
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');

test('C3 Manage route server-loads Manage and Entry without legacy bridge',()=>{
  const page=read('next-shell/app/manage/page.jsx');
  assert.match(page,/loadManageData\(\)/); assert.match(page,/loadEntryCatalogs\(\)/); assert.match(page,/<ManageReadOnlyModule initialData=/); assert.match(page,/entry=\{<EntryModule/);
  assert.doesNotMatch(page,/bridge=|next-accounts-shell/);
});

test('B3 loader allowlists six sheets and preserves recent/month cache with Apps Script fallback',()=>{
  const loader=read('next-shell/lib/manage-server.ts');
  for(const sheet of ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh']) assert.match(loader,new RegExp(`'${sheet}'`));
  assert.match(loader,/'recent_500'/); assert.match(loader,/`month:\$\{month\}`/); assert.match(loader,/AbortSignal\.timeout\(5000\)/);
  assert.match(loader,/api\.get<ManageBundle>\('readManageData'/); assert.match(loader,/spreadsheetId: workbook\.spreadsheetId/);
  assert.match(loader,/limit: startDate \|\| endDate \? '500' : '50'/);
});

test('C3 Manage ports C2 tabs filters stats pagination and RBAC write lifecycle',()=>{
  const module=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(module,/const PAGE_SIZE=20/); assert.match(module,/row\.rowIndex/); assert.match(module,/id="manageView"/); assert.match(module,/id="manageTabsBar"/); assert.match(module,/manage-horizontal-table/);
  for(const label of ['Mới nhất','Hôm nay','7 ngày','Tháng này','Tháng trước','Tùy chọn','Nguồn dầu','Nguồn chi','Tổng số lít','Tổng số chuyến']) assert.match(module,new RegExp(label));
  for(const action of ['saveSheetRow','deleteSheetRow','processWriteJobs']) assert.match(module,new RegExp(`'${action}'`));
  assert.match(module,/context\.user\.role!==['"]shareholder['"]/); assert.match(module,/previousRowData/); assert.match(module,/formulaColumn/);
  assert.doesNotMatch(module,/google\.script|SpreadsheetApp|window\.appData/);
});

test('B3 Manage repository sends exact Supabase bundle filters with server credentials',async()=>{
  const calls=[]; const {createManageBundleRepository}=require('../server/repositories/manage-bundle-repository');
  const repository=createManageBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return{ok:true,json:async()=>[{sheet_name:'NL_Dau',filter_key:'recent_500',payload:{headers:[],rows:[]},synced_at:'now'}]};}});
  const row=await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'server-only'},'NL_Dau','recent_500');
  assert.equal(row.sheet_name,'NL_Dau'); assert.match(calls[0].url,/sheet_name=eq\.NL_Dau/); assert.match(calls[0].url,/filter_key=eq\.recent_500/);
  assert.equal(calls[0].options.headers.Authorization,'Bearer server-only');
});
