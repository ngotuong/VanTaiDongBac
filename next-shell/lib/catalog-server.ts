import 'server-only';

import { createCatalogBundleRepository } from '../../server/repositories/catalog-bundle-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { loadServerWorkbookContext } from './request-context.js';
import { createServerApiClient } from './platform/server-api-client';
import type { CatalogBundle, CatalogDataResponse, CatalogSheetName } from './platform/catalog-types';

export const CATALOG_SHEETS: CatalogSheetName[] = ['DM_NhanSu','DM_Xe','DM_DuAn','DM_CheDoLuong','DM_LuongChuyen','DM_ThamSo_TS','DM_GiaDau','DM_DonGiaVanChuyen','DM_ThuongQuanLy','DM_PhatNoiBo','DM_PhanCongXe','DM_BaoHiem','DM_UuDaiNoiBo'];
function httpError(status:number,message:string){ return Object.assign(new Error(message),{status}); }
function validSheet(value:unknown):CatalogSheetName { const name=String(value||'DM_NhanSu').trim() as CatalogSheetName; if(!CATALOG_SHEETS.includes(name)) throw httpError(400,'Danh mục không hợp lệ.'); return name; }
function publicBundle(payload:unknown,syncedAt:string):CatalogBundle|null {
  if(!payload||typeof payload!=='object') return null;
  const value=payload as CatalogBundle;
  if(value.ok===false||!Array.isArray(value.headers)||!Array.isArray(value.rows)) return null;
  return {...value,headers:value.headers.map(String),supabaseCached:true,supabaseSyncedAt:syncedAt};
}
const REQUIRED_EDITABLE_HEADERS:Partial<Record<CatalogSheetName,string[]>>={
  DM_DuAn:['Dự Án','Số km','Từ ngày','Đến ngày','Nhóm vận hành','Lương chuyến?','Thưởng QL?','Ghi chú']
};
function satisfiesEditableContract(bundle:CatalogBundle,sheetName:CatalogSheetName){
  const required=REQUIRED_EDITABLE_HEADERS[sheetName];
  if(!required)return true;
  const editable=new Set((bundle.editableHeaders||[]).map(String));
  return required.every((header)=>editable.has(header));
}
function primaryTable(bundle:CatalogBundle,sheetName:CatalogSheetName):CatalogBundle {
  if(sheetName==='DM_ThamSo_TS') return bundle;
  if(sheetName==='DM_NhanSu'){
    const visible=new Set(['nhân sự','chức vụ','người tuyển','tính thưởng','dừng thưởng','ngày vào','ngày nghỉ','lương cứng','nghỉ chuẩn','trạng thái','công ty']);
    const indexes=bundle.headers.map((header,index)=>({header:String(header||'').trim().toLocaleLowerCase('vi-VN'),index})).filter(({header})=>visible.has(header)).map(({index})=>index);
    const headers=indexes.map((index)=>bundle.headers[index]);
    return {
      ...bundle,
      headers,
      editableHeaders:(bundle.editableHeaders||[]).filter((header)=>headers.includes(header)),
      rows:bundle.rows.map((row)=>({...row,values:indexes.map((index)=>(row.values||[])[index])}))
        .filter((row)=>row.values.some((value)=>value!==null&&value!==undefined&&String(value).trim()!==''))
    };
  }
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

export async function loadCatalogData(input:{sheetName?:unknown;year?:unknown;forceRefresh?:boolean}={}):Promise<CatalogDataResponse>{
  const sheetName=validSheet(input.sheetName);
  const workbook=await loadServerWorkbookContext({module:'transport',year:input.year});
  let repairSchemaDrift=false;
  if(!input.forceRefresh){
    try{
      const config=runtimeConfig();
      if(config.supabaseUrl&&config.serviceRoleKey){
        const repository=createCatalogBundleRepository({httpError,fetchImpl:(request,init={})=>fetch(request,{...init,signal:AbortSignal.timeout(5000)})});
        const row=await repository.find(config,`transport:${workbook.year}:catalog_data:${sheetName}`);
        const bundle=row&&publicBundle(row.payload,row.synced_at);
        if(bundle&&satisfiesEditableContract(bundle,sheetName)) return {data:primaryTable(bundle,sheetName),sheetName};
        repairSchemaDrift=Boolean(bundle);
      }
    }catch(error){
      throw httpError(503,error instanceof Error?error.message:'Không đọc được Danh mục từ Supabase.');
    }
    if(!repairSchemaDrift)throw httpError(503,'Cache Danh mục trên Supabase chưa sẵn sàng.');
  }
  const api=await createServerApiClient();
  const data=await api.get<CatalogBundle>('readCatalogData',{params:{displaySheetName:sheetName,year:workbook.year,forceRefresh:input.forceRefresh||repairSchemaDrift?'true':'',spreadsheetId:workbook.spreadsheetId}});
  if(data.ok===false) throw httpError(502,data.error||'Không đọc được dữ liệu Danh mục.');
  return {data:primaryTable(data,sheetName),sheetName};
}
