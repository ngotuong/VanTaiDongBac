'use client';
import { businessHeaderField, businessHeaderIsNumber } from '../../lib/platform/business-form-schema';
import { fuelAmountPreview, formatFuelAmountPreview } from '../../lib/platform/fuel-amount-preview';
import { BusinessButton, BusinessGrid, BusinessFieldControl, BusinessAmountSummary } from '../platform/BusinessPrimitives';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { formatStoredNumberInput, formatVietnameseNumberInput, normalizeVietnameseNumberInput } from '../../lib/platform/numeric-input';
import { matchesSearchQuery } from '../../lib/platform/search';
import { showToast } from '../../lib/platform/toast';
import type { EntryCatalogs, EntryFormType } from '../../lib/platform/entry-types';
import type { ManageBundle, ManageDataResponse, ManageRow, ManageSheetName } from '../../lib/platform/manage-types';
import { EntryModule } from '../entry/EntryModule';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { useSwipeDismiss } from '../platform/useSwipeDismiss';
import { useDialogFocusTrap } from '../platform/useDialogFocusTrap';
import { confirmDiscardUnsavedChanges } from '../platform/unsaved-form';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

const SHEETS:Array<[ManageSheetName,string]>=[['NL_VanChuyen','Vận chuyển'],['NL_TaiXe','Tài xế'],['NL_Dau','Xăng dầu'],['NL_ChamCong','Chấm công'],['NL_Phat','Phạt nội bộ'],['NL_NghiVanHanh','Nghỉ vận hành'],['NL_PhanCongLai','Phân công lái'],['NL_SoDuLuong','Số dư lương']];
const NO_DATE_FILTER_SHEETS=new Set<ManageSheetName>(['NL_PhanCongLai','NL_SoDuLuong']);
const ENTRY_FORM_BY_SHEET:Partial<Record<ManageSheetName,EntryFormType>>={NL_VanChuyen:'vanChuyen',NL_TaiXe:'taiXe',NL_Dau:'dau',NL_ChamCong:'chamCong',NL_Phat:'phat',NL_NghiVanHanh:'nghiVanHanh'};
const ENTRY_FORMS=new Set<EntryFormType>(['vanChuyen','taiXe','dau','chamCong','phat','nghiVanHanh']);
const PAGE_SIZE=20;
const api=createClientApiClient();
const manageResponseCache=new Map<string,ManageDataResponse>();
const manageInflight=new Map<string,Promise<ManageDataResponse>>();
const manageCacheKey=(year:string,sheetName:ManageSheetName,startDate:string,endDate:string)=>`${year}|${sheetName}|${startDate}|${endDate}`;
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim();
const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parseNumber=(value:unknown)=>{
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const text=String(value??'').trim().replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!text)return 0;
  let normalized=text;
  if(text.includes(','))normalized=text.replace(/\./g,'').replace(/,(?=.*[,])/g,'').replace(',','.');
  else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(text))normalized=text.replace(/\./g,'');
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:0;
};
const formatQuantity=(value:number)=>value.toLocaleString('vi-VN',{maximumFractionDigits:3});
const numericInputHeader=businessHeaderIsNumber;
function rangeFor(mode:string,year=String(new Date().getFullYear())){const now=new Date();const selectedYear=Number(year);const today=selectedYear===now.getFullYear()?now:new Date(selectedYear,now.getMonth()+1,0);if(mode==='today')return[iso(today),iso(today)];if(mode==='7days'){const start=new Date(today);start.setDate(today.getDate()-6);return[iso(start),iso(today)];}if(mode==='thisMonth')return[iso(new Date(selectedYear,today.getMonth(),1)),iso(today)];if(mode==='lastMonth')return[iso(new Date(selectedYear,today.getMonth()-1,1)),iso(new Date(selectedYear,today.getMonth(),0))];return['',''];}
function visibleColumns(headers:string[],sheet:ManageSheetName){return headers.map((header,index)=>({header:normalize(header),index})).filter(({header})=>!header.startsWith('_sys_')&&(header!=='thang'||sheet==='NL_PhanCongLai')&&!(sheet==='NL_ChamCong'&&['loai ngay cong hop le','luu y'].includes(header))).map(({index})=>index);}
function formulaColumn(header:string,sheet:ManageSheetName){const h=normalize(header);if(h.startsWith('_sys_'))return true;if(sheet==='NL_Dau'&&['thanh tien','cong ty so huu'].includes(h))return true;if(sheet==='NL_ChamCong'&&['so ngay','luong cung','nhom','loai ngay cong hop le','luu y'].some(x=>h.includes(x)))return true;if(sheet==='NL_Phat'&&['noi dung','tien phat'].some(x=>h.includes(x)))return true;if(sheet==='NL_NghiVanHanh'&&['tinh kpi','giam kpi','kiem tra'].some(x=>h.includes(x)))return true;if(sheet==='NL_PhanCongLai'&&h==='kiem tra')return true;if(sheet==='NL_SoDuLuong'&&['so du dau ky','con sau ky','trang thai','ghi chu hien thi'].includes(h))return true;return false;}
function clearableColumns(headers:string[],sheet:ManageSheetName){return headers.filter(header=>header.trim()&&normalize(header)!=='thang'&&!formulaColumn(header,sheet));}
function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return 'Chọn ngày';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return isoDate;
}
function display(value:unknown,header:string){
  if(value==null||value==='')return'';
  const h=normalize(header);
  const text=String(value).trim();
  if(h==='thang'&&/^\d{4}-\d{2}-\d{2}/.test(text))return`${text.slice(5,7)}/${text.slice(0,4)}`;
  if((h.includes('ngay')||/^\d{4}-\d{2}-\d{2}/.test(text))&&/^\d{4}-\d{2}-\d{2}/.test(text)){
    const[y,m,d]=text.slice(0,10).split('-');
    return`${d}/${m}/${y}`;
  }
  if(['thanh tien','tong tien','don gia','tien','tien phat','luong cung','giam kpi'].some(x=>h.includes(x))){
    const num=parseNumber(value);
    if(num!==0||text==='0'||typeof value==='number'){
      return Math.round(num).toLocaleString('vi-VN');
    }
  }
  if(['so lit','lit','so chuyen','chuyen','so gio','cong','so ngay'].some(x=>h.includes(x))){
    const num=parseNumber(value);
    if(num!==0||text==='0'||typeof value==='number'){
      return formatQuantity(num);
    }
  }
  if(typeof value==='number'){
    return Number.isInteger(value)?value.toLocaleString('vi-VN'):value.toLocaleString('vi-VN',{maximumFractionDigits:3});
  }
  return text.replace(/\s*(?:₫|đ)\s*$/i,'');
}
function dateValue(value:string){if(/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return match?`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`:'';}
function column(headers:string[],names:string[]){return headers.findIndex(header=>names.includes(normalize(header)));}
function rowObject(headers:string[],row:ManageRow){return Object.fromEntries(headers.map((header,index)=>[header,row.values[index]??'']));}
function optimisticEntryValues(form:EntryFormType,row:Record<string,string>,headers:string[]){
  const values:Record<string,string>={
    ngay:row.date||row.fromDate||'', 'tu ngay':row.fromDate||row.date||'', 'den ngay':row.toDate||'',
    'bien so':row.vehicle||'', 'bien so xe':row.vehicle||'', 'du an':row.project||row.operationGroup||'', 'nhom van hanh':row.operationGroup||'',
    'tai xe':row.driver||'', 'nhan su':row.person||'', 'hinh thuc':row.workdayType||'', 'loai nghi':row.stopType||'',
    'nguon dau':row.source||'', 'so lit':row.liters||'', 'gia dau':row.price||'', 'nguon chi':row.sourcePay||'',
    'so chuyen':row.trips||'', 'so phieu':row.tickets||'', 'ma phat':row.penaltyCode||'', 'so gio nghi':row.hours||'',
    'ghi chu':row.note||'', 'ghi chu them':row.note||'', 'ly do':row.note||''
  };
  return headers.map((header)=>values[normalize(header)]??'');
}
function manageOptions(header:string,catalogs:EntryCatalogs,sheet:ManageSheetName){const h=normalize(header);if(['bien so','bien so xe','xe','ben so'].includes(h))return(catalogs.vehicles||[]).map(item=>item.plate||'');if(['tai xe','nguoi lai'].includes(h))return(catalogs.activeDrivers||catalogs.people||[]).map(item=>item.name||'');if(h==='nhom van hanh'||(sheet==='NL_NghiVanHanh'&&['du an','ten du an'].includes(h)))return(catalogs.operationGroups||[]).map(item=>item.name||'');if(['du an','ten du an'].includes(h))return(catalogs.projects||[]).map(item=>item.name||'');if(['nhan su','nhan vien','ho va ten','ten nhan su'].includes(h))return(catalogs.people||[]).map(item=>item.name||'');if(['nguon dau','nguon','nguon cung cap'].includes(h))return catalogs.fuelSources||[];if(h==='nguon chi')return catalogs.fuelPaymentSources||[];if(['cong ty','cong ty so huu'].includes(h))return catalogs.companies||[];if(['ma phat','ma vi pham','ma vi pham noi bo'].includes(h))return(catalogs.activePenalties||[]).map(item=>item.code||'');if(['loai ngay cong','loai ngay nghi'].includes(h)||(sheet==='NL_ChamCong'&&h==='hinh thuc'))return(catalogs.chamCongTypes||[]).map(item=>item.name||'');if(['loai nghi','ly do dung may'].includes(h))return catalogs.nghiVanHanhTypes||[];if(['kpi','tinh kpi','huong luong','bu kpi','co tinh kpi?'].includes(h))return['Có','Không'];return[];}
function BodyPortal({children}:{children:React.ReactNode}){return typeof document==='undefined'?null:createPortal(children,document.body);}
async function requestManage(year:string,sheetName:ManageSheetName,startDate:string,endDate:string,forceRefresh=false,bypassClientCache=false):Promise<ManageDataResponse>{
  const key=manageCacheKey(year,sheetName,startDate,endDate);
  if(!forceRefresh&&!bypassClientCache&&manageResponseCache.has(key))return manageResponseCache.get(key)!;
  if(!forceRefresh&&!bypassClientCache&&manageInflight.has(key))return manageInflight.get(key)!;
  const request=(async()=>{const url=new URL('/manage-data/',window.location.origin);url.searchParams.set('year',year);url.searchParams.set('sheetName',sheetName);if(startDate)url.searchParams.set('startDate',startDate);if(endDate)url.searchParams.set('endDate',endDate);if(forceRefresh)url.searchParams.set('forceRefresh','true');const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`Không tải được dữ liệu (${response.status}).`);manageResponseCache.set(key,payload);return payload;})();
  if(!forceRefresh&&!bypassClientCache)manageInflight.set(key,request);
  try{return await request;}finally{manageInflight.delete(key);}
}

export function ManageReadOnlyModule({initialData,initialCatalogs={},initialError=''}:{initialData:ManageDataResponse|null;initialCatalogs?:EntryCatalogs;initialError?:string}){
  const context=useWorkbookContext();const year=context.workbook.year;const canWrite=context.user.role!=='shareholder'&&!context.workbook.readOnly;
  const initialPeriod=context.workbook.readOnly?'all':'thisMonth';
  const initialRange=useMemo(()=>rangeFor(initialPeriod,year),[initialPeriod,year]);
  const[catalogs,setCatalogs]=useState<EntryCatalogs>(initialCatalogs);
  const catalogsRequested=useRef(Object.keys(initialCatalogs).length>0);
  const[data,setData]=useState<ManageBundle|null>(initialData?.data||null);const[sheet,setSheet]=useState<ManageSheetName>(initialData?.sheetName||'NL_VanChuyen');
  const[period,setPeriod]=useState(initialPeriod);const[startDate,setStartDate]=useState(initialRange[0]);const[endDate,setEndDate]=useState(initialRange[1]);const[query,setQuery]=useState('');const[fuelSource,setFuelSource]=useState('all');const[paymentSource,setPaymentSource]=useState('all');const[page,setPage]=useState(1);const[loading,setLoading]=useState(false);const[error,setError]=useState(initialError);const[notice,setNotice]=useState('');const[formError,setFormError]=useState('');const[entryOpen,setEntryOpen]=useState(false);const[entryDirty,setEntryDirty]=useState(false);const[entryForm,setEntryForm]=useState<EntryFormType>('vanChuyen');const[editing,setEditing]=useState<ManageRow|null>(null);const[deletingRow,setDeletingRow]=useState<ManageRow|null>(null);const[saving,setSaving]=useState(false);const[draft,setDraft]=useState<Record<string,string>>({});const[editBaseline,setEditBaseline]=useState<Record<string,string>>({});
  const visibleQueryRef=useRef({sheet,startDate,endDate});
  const headers=data?.headers||[];const columns=visibleColumns(headers,sheet);const fuelIndex=column(headers,['nguon','nguon cung cap','nguon dau']);const paymentIndex=column(headers,['nguon chi']);const noteIndex=column(headers,['ghi chu','ghi chu them']);const literIndex=column(headers,['so lit','lit','so lit dau']);const amountIndex=column(headers,['thanh tien','tong tien','tien']);const tripsIndex=headers.findIndex(header=>normalize(header).includes('so chuyen'));const vehicleIndex=column(headers,['bien so xe','xe','ben so']);const canCreate=canWrite&&!NO_DATE_FILTER_SHEETS.has(sheet);
  const ownerMap=useMemo(()=>Object.fromEntries((catalogs.vehicles||[]).map(vehicle=>[normalize(vehicle.plate),vehicle.owner||''])),[catalogs]);
  const showOwner=vehicleIndex>=0&&!['NL_TaiXe','NL_NghiVanHanh','NL_Dau'].includes(sheet);
  const rows=useMemo(()=>(data?.rows||[]).map(row=>({...row,owner:showOwner?ownerMap[normalize(row.values[vehicleIndex])]||'':''})).filter(row=>{if(!matchesSearchQuery([...row.values,row.owner],query))return false;if(sheet==='NL_Dau'&&fuelSource!=='all'&&fuelIndex>=0&&normalize(row.values[fuelIndex])!==normalize(fuelSource))return false;if(sheet==='NL_Dau'&&paymentSource!=='all'){const key=normalize(paymentSource);if(!normalize([row.values[paymentIndex],row.values[noteIndex],row.owner].join(' ')).includes(key))return false;}return true;}),[data,query,sheet,fuelSource,paymentSource,fuelIndex,paymentIndex,noteIndex,ownerMap,showOwner,vehicleIndex]);

  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));const currentPage=Math.min(page,totalPages);const pageRows=rows.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const uniqueVehiclesCount=useMemo(()=>{if(vehicleIndex<0)return 0;const set=new Set<string>();for(const r of rows){const v=String(r.values[vehicleIndex]??'').trim().toUpperCase();if(v)set.add(v);}return set.size;},[rows,vehicleIndex]);
  const totalLiters=rows.reduce((sum,row)=>sum+parseNumber(row.values[literIndex]),0);const totalAmount=rows.reduce((sum,row)=>sum+parseNumber(row.values[amountIndex]),0);const totalTrips=rows.reduce((sum,row)=>sum+parseNumber(row.values[tripsIndex]),0);
  const editDirty=Boolean(editing)&&JSON.stringify(draft)!==JSON.stringify(editBaseline);
  const entrySwipe=useSwipeDismiss({active:entryOpen,canDismiss:()=>confirmDiscardUnsavedChanges(entryDirty),disabled:saving,onDismiss:()=>setEntryOpen(false)});
  const editSwipe=useSwipeDismiss({active:Boolean(editing),canDismiss:()=>confirmDiscardUnsavedChanges(editDirty),disabled:saving,onDismiss:()=>setEditing(null)});
  const entryDialogRef=useDialogFocusTrap<HTMLElement>({active:entryOpen,disabled:saving,onClose:entrySwipe.close});
  const editDialogRef=useDialogFocusTrap<HTMLElement>({active:Boolean(editing),disabled:saving,onClose:editSwipe.close});
  useEffect(()=>{if(initialData)manageResponseCache.set(manageCacheKey(year,initialData.sheetName,initialRange[0],initialRange[1]),initialData);},[initialData,initialRange,year]);
  useEffect(()=>{
    const targets:ManageSheetName[]=['NL_Dau','NL_TaiXe'];
    const timers=targets.map((target,index)=>window.setTimeout(()=>{void requestManage(year,target,initialRange[0],initialRange[1]).catch(()=>{});},350+index*450));
    return()=>timers.forEach(timer=>window.clearTimeout(timer));
  },[initialRange,year]);
  useEffect(()=>{if(catalogsRequested.current)return;catalogsRequested.current=true;let active=true;api.get<EntryCatalogs&{catalogs?:EntryCatalogs}>('getCatalogs',{params:{formType:'',year}}).then(result=>{if(active)setCatalogs(result.catalogs||result);}).catch(()=>{});return()=>{active=false;};},[year]);
  useEffect(()=>{const url=new URL(window.location.href);const requested=url.searchParams.get('entry') as EntryFormType|null;if(!requested||!ENTRY_FORMS.has(requested))return;url.searchParams.delete('entry');window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);const timer=window.setTimeout(()=>{setEntryForm(requested);setEntryOpen(true);},0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{publishDataSourceMeta(data);},[data]);
  useEffect(()=>{visibleQueryRef.current={sheet,startDate,endDate};},[sheet,startDate,endDate]);
  useEffect(()=>{document.body.classList.toggle('mobile-entry-open',entryOpen);document.body.classList.toggle('manage-modal-open',entryOpen||Boolean(editing)||Boolean(deletingRow));return()=>{document.body.classList.remove('mobile-entry-open');document.body.classList.remove('manage-modal-open');};},[entryOpen,editing,deletingRow]);
  const report=(text:string,isError=false)=>{if(isError){setError(text);setNotice('');}else{setNotice(text);setError('');}showToast(text,isError?'error':'success');};
  const load=async(targetSheet:ManageSheetName,start=startDate,end=endDate,force=false,bypassClientCache=false)=>{const changingSheet=targetSheet!==sheet;const cached=!force&&!bypassClientCache?manageResponseCache.get(manageCacheKey(year,targetSheet,start,end)):undefined;setLoading(!cached);setError('');setNotice('');if(changingSheet){setSheet(targetSheet);setData(cached?.data||null);setPage(1);}if(force||bypassClientCache)showToast(force?'Đang đối soát dữ liệu Vận hành từ Google Sheet…':'Đang tải dữ liệu Vận hành từ Supabase…','loading');try{const response=cached||await requestManage(year,targetSheet,start,end,force,bypassClientCache);setData(response.data);setSheet(response.sheetName);setPage(1);setQuery('');setFuelSource('all');setPaymentSource('all');if(force||bypassClientCache)showToast('Dữ liệu Vận hành đã được cập nhật.','success');}catch(loadError){report(loadError instanceof Error?loadError.message:String(loadError),true);}finally{setLoading(false);}};
  useVisibleRevalidation(async()=>{if(loading||saving||entryOpen||editing||deletingRow)return;const target=visibleQueryRef.current;const response=await requestManage(year,target.sheet,target.startDate,target.endDate,false,true);const current=visibleQueryRef.current;if(current.sheet!==target.sheet||current.startDate!==target.startDate||current.endDate!==target.endDate)return;setData(response.data);setError('');},!loading&&!saving);
  const prepareSheet=(targetSheet:ManageSheetName)=>{if(targetSheet===sheet)return;const targetRange=NO_DATE_FILTER_SHEETS.has(targetSheet)?['','']:rangeFor(period,year);void requestManage(year,targetSheet,targetRange[0],targetRange[1]).catch(()=>{});};
  const changeSheet=(targetSheet:ManageSheetName)=>{if(NO_DATE_FILTER_SHEETS.has(targetSheet)){setPeriod(initialPeriod);setStartDate('');setEndDate('');void load(targetSheet,'','');return;}const[start,end]=rangeFor(period,year);setStartDate(start);setEndDate(end);void load(targetSheet,start,end);};
  const changePeriod=(mode:string)=>{setPeriod(mode);if(mode==='custom')return;const[start,end]=rangeFor(mode,year);setStartDate(start);setEndDate(end);void load(sheet,start,end);};
  const openEntry=()=>{setEntryForm(ENTRY_FORM_BY_SHEET[sheet]||'vanChuyen');setEntryOpen(true);};
  const acceptEntrySubmission=({form,rows:submittedRows}:{form:EntryFormType;rows:Record<string,string>[]})=>{const targetSheet=Object.entries(ENTRY_FORM_BY_SHEET).find(([,value])=>value===form)?.[0] as ManageSheetName|undefined;if(!data||targetSheet!==sheet)return;const pending=submittedRows.map((row,index)=>({rowIndex:-(Date.now()+index),values:optimisticEntryValues(form,row,headers)}));const nextData={...data,rows:[...pending,...data.rows]};setData(nextData);manageResponseCache.set(manageCacheKey(year,sheet,startDate,endDate),{sheetName:sheet,startDate,endDate,data:nextData});};
  const openEdit=(row:ManageRow)=>{const nextDraft=Object.fromEntries(headers.filter(header=>normalize(header)!=='thang'&&!formulaColumn(header,sheet)).map(header=>{const value=row.values[headers.indexOf(header)]??'';return[header,numericInputHeader(header)?formatStoredNumberInput(value):String(value)];}));setFormError('');setEditing(row);setDraft(nextDraft);setEditBaseline(nextDraft);};
  const save=async()=>{if(!editing||!data||!canWrite)return;const target=editing;const rowData=Object.fromEntries(Object.entries(draft).map(([header,value])=>[header,numericInputHeader(header)?normalizeVietnameseNumberInput(value):value]));setSaving(true);setFormError('');setError('');showToast('Đang tiếp nhận thay đổi…','loading');try{const result=await api.post<{ok?:boolean;queued?:boolean;jobId?:string;error?:string}>('saveSheetRow',{body:{year,sheetName:sheet,rowIndex:target.rowIndex,rowData,previousRowData:rowObject(headers,target),clientRequestId:`manage-save-${sheet}-${target.rowIndex}-${Date.now()}-${crypto.randomUUID()}`}});if(result.ok===false)throw new Error(result.error||'Không tiếp nhận được lệnh sửa dữ liệu.');const nextData={...data,rows:data.rows.map(row=>row.rowIndex===target.rowIndex?{...row,values:headers.map((header,index)=>Object.prototype.hasOwnProperty.call(rowData,header)?rowData[header]:row.values[index])}:row)};setData(nextData);manageResponseCache.set(manageCacheKey(year,sheet,startDate,endDate),{sheetName:sheet,startDate,endDate,data:nextData});editSwipe.forceClose();report('Đã nhận thay đổi. Google Sheet và cache sẽ đồng bộ nền.');void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});}catch(saveError){const raw=saveError instanceof Error?saveError.message:String(saveError);const message=/load failed|failed to fetch/i.test(raw)?'Kết nối bị gián đoạn nên chưa xác nhận được lệnh. Dữ liệu trong form vẫn được giữ; hãy kiểm tra danh sách trước khi gửi lại.':raw;setFormError(message);showToast(message,'error');}finally{setSaving(false);}};
  const confirmRemove=async(row:ManageRow)=>{if(!canWrite)return;setSaving(true);setError('');showToast('Đang tiếp nhận lệnh xóa…','loading');try{const result=await api.post<{ok?:boolean;queued?:boolean;jobId?:string;error?:string}>('deleteSheetRow',{body:{year,sheetName:sheet,rowIndex:row.rowIndex,columnsToClear:clearableColumns(headers,sheet),rowData:rowObject(headers,row),clientRequestId:`manage-delete-${sheet}-${row.rowIndex}-${Date.now()}-${crypto.randomUUID()}`}});if(result.ok===false)throw new Error(result.error||'Không tiếp nhận được lệnh xóa dữ liệu.');if(data){const nextData={...data,rows:data.rows.filter(item=>item.rowIndex!==row.rowIndex)};setData(nextData);manageResponseCache.set(manageCacheKey(year,sheet,startDate,endDate),{sheetName:sheet,startDate,endDate,data:nextData});}setDeletingRow(null);report('Đã nhận lệnh xóa; đang đồng bộ nền.');void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});}catch(deleteError){report(deleteError instanceof Error?deleteError.message:String(deleteError),true);}finally{setSaving(false);}};

  return <section id="manageView" className="view active manage-c2" data-next-manage="true" aria-label="Quản lý vận hành">
    <div className="sub-tabs-bar app-sticky-tabs" id="manageTabsBar" role="tablist" aria-label="Nhật ký vận hành">{SHEETS.map(([name,label])=><button type="button" role="tab" aria-selected={sheet===name} className={`sub-tab${sheet===name?' active':''}`} onPointerEnter={()=>prepareSheet(name)} onFocus={()=>prepareSheet(name)} onClick={()=>changeSheet(name)} disabled={loading} key={name}>{label}</button>)}</div>
    {!NO_DATE_FILTER_SHEETS.has(sheet) ? <section className="panel cashflow-overview-filter-panel manage-filter-panel">
      <div className="cashflow-filter-stack">
        <div className="cashflow-filter-row-top">
          <div className="cashflow-filter-row-bottom">
            <div className="custom-date-box cashflow-date-input">
              <span className="date-display-text">{formatDisplayDate(startDate)}</span>
              <input type="date" aria-label="Từ ngày" className="native-date-input vi-date-input" value={startDate} onChange={event=>{ const start=event.target.value; setStartDate(start); setPeriod('custom'); void load(sheet,start,endDate); }}/>
            </div>
            <span className="date-range-separator">→</span>
            <div className="custom-date-box cashflow-date-input">
              <span className="date-display-text">{formatDisplayDate(endDate)}</span>
              <input type="date" aria-label="Đến ngày" className="native-date-input vi-date-input" value={endDate} onChange={event=>{ const end=event.target.value; setEndDate(end); setPeriod('custom'); void load(sheet,startDate,end); }}/>
            </div>
          </div>
          <select aria-label="Bộ lọc nhanh thời gian vận hành" className="cashflow-quick-period-select platform-content-select" value={period} onChange={event=>changePeriod(event.target.value)}>
            <option value="thisMonth">Tháng này</option><option value="today">Hôm nay</option><option value="7days">7 ngày</option><option value="lastMonth">Tháng trước</option><option value="all">Tất cả</option><option value="custom">Tùy chọn</option>
          </select>
        </div>
        <div className="cashflow-filter-row-search">
          <input type="search" className="manage-card-search-input" value={query} placeholder="Tìm nhiều giá trị, ngăn cách bằng dấu phẩy..." aria-label="Tìm kiếm theo biển số, tài xế" onChange={event=>{ setQuery(event.target.value); setPage(1); }}/>
          {canCreate?<button type="button" className="primary touch-action-btn manage-add-top-btn" onClick={openEntry}>＋ Nhập mới</button>:null}
        </div>
      </div>
    </section> : <div className="filter-bar app-sticky-toolbar sticky-after-tabs"><div className="mobile-operation-bar"><span>{sheet==='NL_SoDuLuong'?'Theo dõi xử lý số dư lương theo kỳ':'Phân công công ty theo tháng'}</span>{canCreate?<button type="button" className="primary" onClick={openEntry}>＋ Nhập mới</button>:null}</div></div>}
    {loading?<div className="status show" role="status" aria-live="polite">Đang tải {SHEETS.find(([name])=>name===sheet)?.[1]} từ Supabase…</div>:(error||notice)?<div className={`status show ${error?'err':'ok'}`} role={error?'alert':'status'} aria-live="polite">{error||notice}</div>:null}
    {sheet==='NL_TaiXe'?<div className="manage-stat-tai-xe">Tổng chuyến: <strong className="tabular-nums">{formatQuantity(totalTrips)}</strong></div>:null}
    {sheet==='NL_Dau'?<div id="manageDauFilterBlock"><div><label>Nguồn dầu:<select className="platform-content-select" value={fuelSource} onChange={event=>{setFuelSource(event.target.value);setPage(1);}}><option value="all">Tất cả</option>{(catalogs.fuelSources||[]).map(value=><option key={value}>{value}</option>)}</select></label><label>Nguồn chi:<select className="platform-content-select" value={paymentSource} onChange={event=>{setPaymentSource(event.target.value);setPage(1);}}><option value="all">Tất cả</option>{(catalogs.fuelPaymentSources||[]).map(value=><option key={value}>{value}</option>)}</select></label></div><div><span>Tổng lít: <strong className="tabular-nums">{formatQuantity(totalLiters)}</strong> lít</span><span>Tổng tiền: <strong className="danger tabular-nums">{Math.round(totalAmount).toLocaleString('vi-VN')}</strong></span></div></div>:null}
    {entryOpen?<BodyPortal><button type="button" className={`entry-sheet-backdrop active${entrySwipe.closing?' closing':''}`} aria-label="Đóng nhập liệu" onClick={entrySwipe.close}/><section ref={entryDialogRef} tabIndex={-1} className={`manage-entry-embedded swipe-dismiss-surface${entrySwipe.closing?' closing':''}`} data-business-form-sheet="entry" data-business-form-size="wide" role="dialog" aria-modal="true" aria-label="Nhập mới dữ liệu vận hành" {...entrySwipe.gestureProps}><EntryModule initialCatalogs={catalogs} initialForm={entryForm} onClose={entrySwipe.close} onSubmitted={submission=>{acceptEntrySubmission(submission);entrySwipe.forceClose();}} onDirtyChange={setEntryDirty}/></section></BodyPortal>:null}
    <section className="table-card" aria-label={SHEETS.find(([name])=>name===sheet)?.[1]}>{data?.isLimited?<div className="manage-limit-notice">Đang hiển thị phạm vi dữ liệu cache gần nhất.</div>:null}<div className="table-scroll manage-table-scroll manage-horizontal-scroll" tabIndex={0} aria-label="Bảng vận hành, cuộn ngang để xem đủ cột"><table className="report-table mobile-record-table manage-horizontal-table"><thead><tr>{columns.map((index,columnIndex)=><th className={columnIndex===0?'sticky-col':''} scope="col" key={index}>{headers[index]}</th>)}{showOwner?<th scope="col">Công ty/Chủ xe</th>:null}{canWrite?<th className="sticky-col-right" scope="col">Thao tác</th>:null}</tr></thead><tbody>{pageRows.length?pageRows.map(row=><tr key={row.rowIndex}>{columns.map((index,columnIndex)=>{const isNumeric=['tien','lit','chuyen','don gia','cong','so'].some(x=>normalize(headers[index]).includes(x));return <td className={`${columnIndex===0?'sticky-col':''} ${isNumeric?'tabular-nums':''}`} data-label={headers[index]} key={index}>{display(row.values[index],headers[index])}</td>;})}{showOwner?<td data-label="Công ty/Chủ xe">{row.owner}</td>:null}{canWrite?<td className="sticky-col-right manage-row-actions"><button type="button" className="btn-table-action edit touch-action-btn" onClick={()=>openEdit(row)} aria-label={`Sửa dòng ${row.rowIndex}`} title="Sửa dòng"><svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button type="button" className="btn-table-action delete danger touch-action-btn" onClick={()=>setDeletingRow(row)} disabled={saving} aria-label={`Xóa dòng ${row.rowIndex}`} title="Xóa dòng"><svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>:null}</tr>):<tr><td colSpan={Math.max(1,columns.length+(showOwner?1:0)+(canWrite?1:0))} className="manage-empty">Không có dữ liệu phù hợp với tìm kiếm của bạn.</td></tr>}</tbody>{pageRows.length>0?<tfoot className="sticky-total-foot"><tr className="manage-total-row">{columns.map((colIndex,columnIndex)=>{if(columnIndex===0)return <td className="sticky-col total-label" key={colIndex}>Tổng</td>;if(colIndex===vehicleIndex)return <td className="tabular-nums font-bold" key={colIndex}>{uniqueVehiclesCount>0?`${uniqueVehiclesCount} xe`:''}</td>;if(colIndex===literIndex)return <td className="tabular-nums font-bold" key={colIndex}>{formatQuantity(totalLiters)} lít</td>;if(colIndex===amountIndex)return <td className="tabular-nums font-bold text-danger" key={colIndex}>{Math.round(totalAmount).toLocaleString('vi-VN')}</td>;if(colIndex===tripsIndex)return <td className="tabular-nums font-bold" key={colIndex}>{formatQuantity(totalTrips)}</td>;return <td key={colIndex}></td>;})}{showOwner?<td></td>:null}{canWrite?<td className="sticky-col-right"></td>:null}</tr></tfoot>:null}</table></div><div className="manage-react-pagination"><span>{rows.length?`Đang hiển thị ${(currentPage-1)*PAGE_SIZE+1}-${Math.min(currentPage*PAGE_SIZE,rows.length)} trên ${rows.length}`:'Đang hiển thị 0-0 trên 0'}</span><div><button type="button" className="secondary" onClick={()=>setPage(Math.max(1,currentPage-1))} disabled={currentPage<=1}>← Trước</button><button type="button" className="secondary" onClick={()=>setPage(Math.min(totalPages,currentPage+1))} disabled={currentPage>=totalPages}>Sau →</button></div></div></section>
    <button type="button" hidden data-shell-refresh onClick={()=>void load(sheet,startDate,endDate,false,true)}>Làm mới</button>
    {editing?<BodyPortal><div className={`modal-overlay active side-drawer-overlay${editSwipe.closing?' closing':''}`} role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)editSwipe.close();}}><section ref={editDialogRef} tabIndex={-1} className={`modal-container swipe-dismiss-surface${editSwipe.closing?' closing':''}`} data-business-form-sheet="edit" data-business-form-size={Object.keys(draft).length<=5?'compact':'standard'} role="dialog" aria-modal="true" aria-labelledby="manageModalTitle" {...editSwipe.gestureProps}><header className="modal-header" data-swipe-dismiss-handle><h3 id="manageModalTitle">Chỉnh sửa dòng thứ {editing.rowIndex}</h3><button type="button" className="modal-close-btn" onClick={editSwipe.close} aria-label="Đóng">×</button></header>{formError?<div className="business-form-error" role="alert" aria-live="assertive">{formError}</div>:null}<div className="modal-body" data-overlay-scroll="manage"><BusinessGrid>{Object.keys(draft).map(header=>{const choices=manageOptions(header,catalogs,sheet);const field=businessHeaderField(header,choices,sheet);return <BusinessFieldControl key={header} field={field} value={field.kind==='date'?dateValue(draft[header]):draft[header]} options={choices} disabled={saving} onChange={value=>setDraft(old=>({...old,[header]:numericInputHeader(header)?formatVietnameseNumberInput(value):value}))}/>;})}</BusinessGrid>{sheet==='NL_Dau'?<BusinessAmountSummary value={formatFuelAmountPreview(fuelAmountPreview(draft[headers[literIndex]]||'',draft[headers[column(headers,['gia dau','don gia','gia dau / lit'])]]||''))} hint="Số lít × đơn giá. Chỉ xem trước; công thức Sheet tính thành tiền khi đồng bộ."/>:null}</div><footer className="modal-footer"><BusinessButton variant="outline" onClick={editSwipe.close} disabled={saving}>Hủy bỏ</BusinessButton><BusinessButton onClick={()=>void save()} busy={saving}>{saving?'Đang lưu...':'Lưu lại'}</BusinessButton></footer></section></div></BodyPortal>:null}
    {deletingRow?<BodyPortal><div className="modal-overlay active" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setDeletingRow(null);}}><section className="modal-container modal-sm" role="dialog" aria-modal="true" aria-labelledby="deleteModalTitle"><header className="modal-header danger-header"><h3 id="deleteModalTitle">Xác nhận xóa dòng Sheet #{deletingRow.rowIndex}</h3><button type="button" className="modal-close-btn" onClick={()=>setDeletingRow(null)} aria-label="Đóng">×</button></header><div className="modal-body"><p className="modal-confirm-text">Bạn có chắc chắn muốn xóa dòng dữ liệu thứ <strong>#{deletingRow.rowIndex}</strong> thuộc bảng <strong>{SHEETS.find(([n])=>n===sheet)?.[1]}</strong> không? Thao tác này sẽ gửi lệnh xóa lên Google Sheet.</p></div><footer className="modal-footer"><button type="button" className="outline" onClick={()=>setDeletingRow(null)} disabled={saving}>Hủy bỏ</button><button type="button" className="primary danger-btn" onClick={()=>void confirmRemove(deletingRow)} disabled={saving}>{saving?'Đang xóa...':'Xác nhận xóa'}</button></footer></section></div></BodyPortal>:null}
  </section>;
}
