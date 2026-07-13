const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname,'..');
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');

test('B3 Manage route performs initial server read without legacy bridge',()=>{
  const page=read('next-shell/app/manage/page.jsx');
  assert.match(page,/loadManageData\(\)/); assert.match(page,/<ManageReadOnlyModule initialData=/);
  assert.doesNotMatch(page,/ManageEntry|bridge=|next-accounts-shell/);
});

test('B3 loader allowlists six sheets and preserves recent/month cache with Apps Script fallback',()=>{
  const loader=read('next-shell/lib/manage-server.ts');
  for(const sheet of ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh']) assert.match(loader,new RegExp(`'${sheet}'`));
  assert.match(loader,/'recent_500'/); assert.match(loader,/`month:\$\{month\}`/); assert.match(loader,/AbortSignal\.timeout\(5000\)/);
  assert.match(loader,/api\.get<ManageBundle>\('readManageData'/); assert.match(loader,/spreadsheetId: workbook\.spreadsheetId/);
  assert.match(loader,/limit: startDate \|\| endDate \? '500' : '50'/);
});

test('B3 UI keeps tabs filters row identity and pagination but exposes no write lifecycle',()=>{
  const module=read('next-shell/components/manage/ManageReadOnlyModule.tsx');
  assert.match(module,/const PAGE_SIZE = 20/); assert.match(module,/Dòng Sheet/); assert.match(module,/row\.rowIndex/);
  for(const label of ['Gần đây','Hôm nay','7 ngày qua','Tháng này','Tháng trước','Tùy chọn','Nguồn dầu','Nguồn chi']) assert.match(module,new RegExp(label));
  assert.match(module,/data-next-manage-readonly="true"/); assert.match(module,/role="alert"/); assert.match(module,/aria-busy="true"/);
  assert.doesNotMatch(module,/submitRows|saveSheetRow|deleteSheetRow|openManageEditModal|pendingWrite|google\.script|window\.appData/);
});

test('B3 Manage repository sends exact Supabase bundle filters with server credentials',async()=>{
  const calls=[]; const {createManageBundleRepository}=require('../server/repositories/manage-bundle-repository');
  const repository=createManageBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return{ok:true,json:async()=>[{sheet_name:'NL_Dau',filter_key:'recent_500',payload:{headers:[],rows:[]},synced_at:'now'}]};}});
  const row=await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'server-only'},'NL_Dau','recent_500');
  assert.equal(row.sheet_name,'NL_Dau'); assert.match(calls[0].url,/sheet_name=eq\.NL_Dau/); assert.match(calls[0].url,/filter_key=eq\.recent_500/);
  assert.equal(calls[0].options.headers.Authorization,'Bearer server-only');
});
