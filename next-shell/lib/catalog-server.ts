import 'server-only';

import { createCatalogBundleRepository } from '../../server/repositories/catalog-bundle-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { CatalogBundle, CatalogDataResponse, CatalogSheetName } from './platform/catalog-types';

export const CATALOG_SHEETS: CatalogSheetName[] = ['DM_NhanSu','DM_Xe','DM_DuAn','DM_CheDoLuong','DM_LuongChuyen','DM_ThamSo_TS','DM_GiaDau','DM_DonGiaVanChuyen','DM_ThuongQuanLy','DM_PhatNoiBo','DM_PhanCongXe','DM_UuDaiNoiBo'];
function httpError(status:number,message:string){ return Object.assign(new Error(message),{status}); }
function validSheet(value:unknown):CatalogSheetName { const name=String(value||'DM_NhanSu').trim() as CatalogSheetName; if(!CATALOG_SHEETS.includes(name)) throw httpError(400,'Danh mục không hợp lệ.'); return name; }
function publicBundle(payload:unknown,syncedAt:string):CatalogBundle|null {
  if(!payload||typeof payload!=='object') return null;
  const value=payload as CatalogBundle;
  if(value.ok===false||!Array.isArray(value.headers)||!Array.isArray(value.rows)) return null;
  return {...value,headers:value.headers.map(String),supabaseCached:true,supabaseSyncedAt:syncedAt};
}
function primaryTable(bundle:CatalogBundle,sheetName:CatalogSheetName):CatalogBundle {
  if(sheetName==='DM_ThamSo_TS') return bundle;
  const emptyIndex=bundle.headers.findIndex((header)=>String(header||'').trim()==='');
  const width=emptyIndex===-1?bundle.headers.length:emptyIndex;
  return {
    ...bundle,
    headers:bundle.headers.slice(0,width),
    editableHeaders:(bundle.editableHeaders||[]).filter((header)=>bundle.headers.slice(0,width).includes(header)),
    rows:bundle.rows.map((row)=>({...row,values:(row.values||[]).slice(0,width)}))
      .filter((row)=>row.values.some((value)=>value!==null&&value!==undefined&&String(value).trim()!==''))
  };
}

export async function loadCatalogData(input:{sheetName?:unknown;forceRefresh?:boolean}={}):Promise<CatalogDataResponse>{
  const sheetName=validSheet(input.sheetName);
  const workbook=createWorkbookContextService({httpError}).resolve({module:'transport'});
  if(!input.forceRefresh){
    try{
      const config=runtimeConfig();
      if(config.supabaseUrl&&config.serviceRoleKey){
        const repository=createCatalogBundleRepository({httpError,fetchImpl:(request,init={})=>fetch(request,{...init,signal:AbortSignal.timeout(5000)})});
        const row=await repository.find(config,`catalog_data:${sheetName}`);
        const bundle=row&&publicBundle(row.payload,row.synced_at);
        if(bundle) return {data:primaryTable(bundle,sheetName),sheetName};
      }
    }catch(error){
      throw httpError(503,error instanceof Error?error.message:'Không đọc được Danh mục từ Supabase.');
    }
    throw httpError(503,'Cache Danh mục trên Supabase chưa sẵn sàng.');
  }
  const api=await createServerApiClient();
  const data=await api.get<CatalogBundle>('readCatalogData',{params:{displaySheetName:sheetName,forceRefresh:input.forceRefresh?'true':'',spreadsheetId:workbook.spreadsheetId}});
  if(data.ok===false) throw httpError(502,data.error||'Không đọc được dữ liệu Danh mục.');
  return {data:primaryTable(data,sheetName),sheetName};
}
