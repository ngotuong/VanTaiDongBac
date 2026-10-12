const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname,'..');
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');

test('C3 Manage route server-loads Manage and reuses the loaded catalogs when opening Entry',()=>{
  const page=read('next-shell/app/manage/page.jsx'),module=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(page,/loadManageData\(currentTransportMonthRange\(\)\)/); assert.doesNotMatch(page,/loadEntryCatalogs\(\)/); assert.match(page,/<ManageReadOnlyModule initialData=/);
  assert.match(module,/entryOpen\?<BodyPortal>[\s\S]*<EntryModule initialCatalogs=\{catalogs\}/); assert.doesNotMatch(module,/loadEntryCatalogs\(\)/);
  assert.doesNotMatch(page,/bridge=|next-accounts-shell/);
});

test('B3 loader keeps ordinary Manage reads on Supabase and reserves Apps Script for explicit refresh',()=>{
  const loader=read('next-shell/lib/manage-server.ts');
  for(const sheet of ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh','NL_PhanCongLai','NL_SoDuLuong']) assert.match(loader,new RegExp(`'${sheet}'`));
  assert.match(loader,/'recent_500'/); assert.match(loader,/`month:\$\{month\}`/); assert.match(loader,/AbortSignal\.timeout\(5000\)/);
  assert.match(loader,/const \[rows, recentRow\] = await Promise\.all/);
  assert.match(loader,/if \(recentBundle\) return/);
  assert.match(loader,/Cache Vận hành trên Supabase chưa sẵn sàng/);
  assert.match(loader,/api\.get<ManageBundle>\('readManageData'/); assert.match(loader,/spreadsheetId: workbook\.spreadsheetId/);
  assert.match(loader,/limit: startDate \|\| endDate \? '500' : '50'/);
  assert.ok(loader.indexOf("if (!input.forceRefresh)") < loader.indexOf("api.get<ManageBundle>('readManageData'"));
});

test('Manage exposes salary balances but protects every formula and system column',()=>{
  const module=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(module,/\['NL_SoDuLuong','Số dư lương'\]/);
  assert.match(module,/NO_DATE_FILTER_SHEETS=new Set<ManageSheetName>/);
  assert.match(module,/h\.startsWith\('_sys_'\)/);
  for(const header of ['so du dau ky','con sau ky','trang thai','ghi chu hien thi']) assert.match(module,new RegExp(header));
});

test('C3 Manage ports C2 tabs filters stats pagination and RBAC write lifecycle',()=>{
  const module=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(module,/const PAGE_SIZE=20/); assert.match(module,/row\.rowIndex/); assert.match(module,/id="manageView"/); assert.match(module,/id="manageTabsBar"/); assert.match(module,/manage-horizontal-table/);
  assert.match(module,/className="view active manage-c2"/); assert.match(module,/'getCatalogs'/);
  for(const label of ['Hôm nay','7 ngày','Tháng này','Tháng trước','Tùy chọn','Nguồn dầu','Nguồn chi','Tổng lít','Tổng chuyến','Tổng tiền']) assert.match(module,new RegExp(label));
  for(const action of ['saveSheetRow','deleteSheetRow','processWriteJobs']) assert.match(module,new RegExp(`'${action}'`));
  assert.match(module,/context\.user\.role!==['"]shareholder['"]/); assert.match(module,/previousRowData/); assert.match(module,/formulaColumn/);
  assert.match(module,/columnsToClear:clearableColumns\(headers,sheet\)/);
  assert.match(module,/clearableColumns[\s\S]*normalize\(header\)!==['"]thang['"][\s\S]*!formulaColumn\(header,sheet\)/);
  assert.doesNotMatch(module,/google\.script|SpreadsheetApp|window\.appData/);
});

test('Manage transport delete API refuses physical row deletion when clear columns are missing',()=>{
  const api=read('PublicApi.gs');
  assert.match(api,/if \(isTransportManageSheet_\(safeBody\.sheetName\)\) \{[\s\S]*!Array\.isArray\(safeBody\.columnsToClear\)[\s\S]*từ chối deleteRow\(\)/);
  assert.ok(api.indexOf('từ chối deleteRow()') < api.indexOf('SupabaseService.enqueueTransportDeleteSheetRow'));
});

test('B3 Manage repository sends exact Supabase bundle filters with server credentials',async()=>{
  const calls=[]; const {createManageBundleRepository}=require('../server/repositories/manage-bundle-repository');
  const repository=createManageBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return{ok:true,json:async()=>[{sheet_name:'NL_Dau',filter_key:'recent_500',payload:{headers:[],rows:[]},synced_at:'now'}]};}});
  const row=await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'server-only'},'NL_Dau','recent_500');
  assert.equal(row.sheet_name,'NL_Dau'); assert.match(calls[0].url,/sheet_name=eq\.NL_Dau/); assert.match(calls[0].url,/filter_key=eq\.recent_500/);
  assert.equal(calls[0].options.headers.Authorization,'Bearer server-only');
});
