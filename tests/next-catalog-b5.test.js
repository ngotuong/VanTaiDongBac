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

test('C3 Catalog restores the C2 golden-master surface instead of redesigning it',()=>{
  const module=read('next-shell/components/catalog/CatalogModule.tsx');
  const css=read('next-shell/app/c2-golden.css');
  assert.match(module,/id="catalogView" className="view active catalog-c2"/);
  for(const id of ['catalogTabsBar','catalogSheetSelect','catalogSearchInput','catalogPersonnelStatusFilter','catalogVehicleOwnerFilter','catalogTable','catalogTableHeader','catalogTableBody','catalogTableEmpty','catalogPaginationBar','catalogPaginationInfo','catalogPrevPageBtn','catalogNextPageBtn']) assert.match(module,new RegExp(`id="${id}"`));
  for(const className of ['sub-tabs-bar app-sticky-tabs','filter-bar catalog-sticky-toolbar app-sticky-toolbar sticky-after-tabs','table-card','report-table mobile-record-table','modal-overlay active','modal-container','modal-grid','modal-footer']) assert.match(module,new RegExp(className));
  assert.match(module,/Công ty\/Chủ xe/);
  assert.match(module,/previousRowData/);
  assert.match(css,/C3 Catalog bindings: exact C2 structure/);
  assert.doesNotMatch(module,/catalog-header|catalog-card-head|catalog-modal-backdrop|platform-eyebrow/);
});

test('B5 reads cache server-first and keeps Apps Script as authoritative fallback with workbook context',()=>{
  const server=read('next-shell/lib/catalog-server.ts');
  assert.match(server,/catalog_data:\$\{sheetName\}/);
  assert.match(server,/repository\.find/);
  assert.match(server,/createServerApiClient/);
  assert.match(server,/spreadsheetId:workbook\.spreadsheetId/);
  assert.match(server,/forceRefresh/);
  assert.doesNotMatch(server,/getActiveSpreadsheet|NEXT_PUBLIC_.*SERVICE|spreadsheetId\?:unknown/);
  assert.match(server,/primaryTable/);
  assert.match(server,/findIndex\(\(header\)=>String\(header\|\|''\)\.trim\(\)===''\)/);
});

test('B5 shares the Manage read boundary to remain within the Vercel Hobby function limit',()=>{
  const route=read('next-shell/app/manage-data/route.ts');
  const module=read('next-shell/components/catalog/CatalogModule.tsx');
  assert.match(route,/surface.*catalog/);
  assert.match(route,/loadCatalogData/);
  assert.match(module,/manage-data/);
  assert.doesNotMatch(module,/catalog-data/);
  assert.equal(fs.existsSync(path.join(root,'app/catalog-data/route.ts')),false);
});

test('B5 remains admin/operator-only through existing RBAC contracts',()=>{
  const registry=read('ApiActionRegistry.gs');
  const shell=read('next-shell/components/platform/AppShell.tsx');
  for(const action of ['readCatalogData','saveSheetRow','deleteSheetRow']) assert.match(registry,new RegExp(`${action}: \\{ method: '(GET|POST)', kind: '(query|command)', permission: 'adminOperator'`));
  assert.match(shell,/href: '\/catalog'.*roles: \[\.\.\.WRITE_ROLES\]/);
});

test('catalog cache repository uses an exact catalog key and service-side credentials',async()=>{
  const {createCatalogBundleRepository}=require('../server/repositories/catalog-bundle-repository.js');
  let request;
  const repository=createCatalogBundleRepository({httpError:(status,message)=>Object.assign(new Error(message),{status}),fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>[{catalog_key:'catalog_data:DM_Xe',payload:{headers:[],rows:[]},synced_at:'2026-07-13T00:00:00Z'}]};}});
  const row=await repository.find({supabaseUrl:'https://cache.test',serviceRoleKey:'secret'},'catalog_data:DM_Xe');
  assert.equal(row.catalog_key,'catalog_data:DM_Xe');
  const url=new URL(request.url);
  assert.equal(url.pathname,'/rest/v1/catalog_bundles');
  assert.equal(url.searchParams.get('catalog_key'),'eq.catalog_data:DM_Xe');
  assert.equal(request.options.headers.Authorization,'Bearer secret');
});
