const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('B5 Catalog is a standalone Next route without a legacy bridge',()=>{
  const page=read('next-shell/app/catalog/page.jsx');
  const module=read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(page,/loadCatalogData/);
  assert.match(page,/CatalogModule/);
  assert.doesNotMatch(module,/google\.script|window\.appData|bridge=|CatalogReadOnly/);
  for(const action of ['saveSheetRow','deleteSheetRow']) assert.match(module,new RegExp(`'${action}'`));
});

test('B5 preserves the nine display catalogs and virtual DM_ThamSo mapping',()=>{
  const server=read('next-shell/lib/catalog-server.ts');
  const module=read('next-shell/components/catalog/CatalogModule.tsx');
  const names=['DM_NhanSu','DM_Xe','DM_DuAn','DM_LuongChuyen','DM_ThamSo_TS','DM_ThamSo_GD','DM_DonGiaVanChuyen','DM_ThuongQuanLy','DM_PhatNoiBo'];
  for(const name of names){ assert.match(server,new RegExp(name)); assert.match(module,new RegExp(name)); }
  assert.match(module,/DM_ThamSo_TS'\|\|sheet==='DM_ThamSo_GD'\?'DM_ThamSo'/);
  for(const header of ['Mã tham số','Tên tham số','Giá trị','Ngày áp dụng tham số','Giá dầu áp dụng','Ngày áp dụng giá dầu','Ghi chú']) assert.match(module,new RegExp(header));
});

test('B5 reads cache server-first and keeps Apps Script as authoritative fallback with workbook context',()=>{
  const server=read('next-shell/lib/catalog-server.ts');
  assert.match(server,/catalog_data:\$\{sheetName\}/);
  assert.match(server,/repository\.find/);
  assert.match(server,/createServerApiClient/);
  assert.match(server,/spreadsheetId:workbook\.spreadsheetId/);
  assert.match(server,/forceRefresh/);
  assert.doesNotMatch(server,/getActiveSpreadsheet|NEXT_PUBLIC_.*SERVICE|spreadsheetId\?:unknown/);
});

test('B5 remains admin/operator-only through existing RBAC contracts',()=>{
  const registry=read('ApiActionRegistry.gs');
  const shell=read('next-shell/components/platform/AppShell.tsx');
  for(const action of ['readCatalogData','saveSheetRow','deleteSheetRow']) assert.match(registry,new RegExp(`${action}: \\{ method: '(GET|POST)', kind: '(query|command)', permission: 'adminOperator'`));
  assert.match(shell,/href: '\/catalog'.*roles: \[\.\.\.WRITE_ROLES\]/);
});

test('catalog cache repository uses an exact catalog key and service-side credentials',async()=>{
  const {createCatalogBundleRepository}=require('../api/repositories/catalog-bundle-repository.js');
  let request;
  const repository=createCatalogBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>[{catalog_key:'catalog_data:DM_Xe',payload:{headers:[],rows:[]},synced_at:'2026-07-13T00:00:00Z'}]};}});
  const row=await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'secret'},'catalog_data:DM_Xe');
  assert.equal(row.catalog_key,'catalog_data:DM_Xe');
  const url=new URL(request.url);
  assert.equal(url.pathname,'/rest/v1/catalog_bundles');
  assert.equal(url.searchParams.get('catalog_key'),'eq.catalog_data:DM_Xe');
  assert.equal(request.options.headers.Authorization,'Bearer secret');
});
