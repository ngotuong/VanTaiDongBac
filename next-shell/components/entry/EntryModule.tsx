'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClientApiClient } from '../../lib/platform/client-api-client';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import type { EntryCatalogs, EntryFormType, EntryRow, WriteJob } from '../../lib/platform/entry-types';

const FORMS:Record<EntryFormType,{label:string;note:string;fields:Array<[string,string,string,boolean?]>}>={
  vanChuyen:{label:'Vận chuyển',note:'Số chuyến theo xe & dự án',fields:[['date','Ngày chạy','date'],['vehicle','Biển số xe','vehicles'],['project','Dự án chạy','projects'],['trips','Số chuyến chạy','number'],['tickets','Số phiếu/Chứng từ','text',false],['note','Ghi chú thêm','textarea',false]]},
  taiXe:{label:'Tài xế',note:'Số chuyến theo tài xế chạy',fields:[['date','Ngày chạy','date'],['vehicle','Biển số xe','vehicles'],['driver','Tài xế cầm lái','drivers'],['trips','Số chuyến chạy','number'],['note','Ghi chú thêm','textarea',false]]},
  dau:{label:'Dầu lẻ',note:'Nhiên liệu và giá dầu áp dụng',fields:[['date','Ngày tiếp dầu','date'],['vehicle','Biển số xe nhận','vehicles'],['source','Nguồn cung cấp','fuelSources'],['liters','Số lít dầu','number'],['price','Giá dầu / lít','number'],['sourcePay','Nguồn chi','fuelPaymentSources']]},
  chamCong:{label:'Chấm công',note:'Nghỉ phép, trừ công, nghỉ việc',fields:[['fromDate','Từ ngày','date'],['toDate','Đến ngày (Gồm cả)','date'],['person','Nhân sự nghỉ','people'],['workdayType','Loại ngày nghỉ','chamCongTypes'],['note','Ghi chú thêm','textarea',false]]},
  phat:{label:'Phạt nội bộ',note:'Khấu trừ vi phạm nội bộ',fields:[['date','Ngày lập biên bản','date'],['person','Nhân sự vi phạm','people'],['penaltyCode','Mã vi phạm nội bộ','penalties'],['note','Ghi chú nội dung','textarea',false]]},
  nghiVanHanh:{label:'Nghỉ vận hành',note:'Báo nghỉ mỏ & giảm KPI',fields:[['date','Ngày báo nghỉ','date'],['vehicle','Biển số xe nghỉ','vehicles'],['project','Dự án ảnh hưởng','projects'],['stopType','Lý do dừng máy','nghiVanHanhTypes'],['hours','Số giờ dừng máy','number'],['note','Ghi chú chi tiết','textarea',false]]}
};
const today=()=>new Date().toISOString().slice(0,10);
const blank=(type:EntryFormType):EntryRow=>Object.fromEntries(FORMS[type].fields.map(([key,,kind])=>[key,kind==='date'?today():'']));
const api=createClientApiClient();
function options(c:EntryCatalogs,source:string){
  const item=(value:string,label=value)=>({value,label});
  if(source==='vehicles')return (c.activeVehicles?.length?c.activeVehicles:c.vehicles||[]).map(x=>item(x.plate||'')).filter(x=>x.value);
  if(source==='projects')return (c.projects||[]).map(x=>item(x.name||'')).filter(x=>x.value);
  if(source==='drivers')return (c.activeDrivers?.length?c.activeDrivers:c.people||[]).map(x=>item(x.name||'')).filter(x=>x.value);
  if(source==='people')return (c.activePeople?.length?c.activePeople:c.people||[]).map(x=>item(x.name||'',`${x.name||''}${x.role?' - '+x.role:''}`)).filter(x=>x.value);
  if(source==='penalties')return (c.activePenalties||[]).map(x=>item(x.code||'',`${x.code||''} - ${x.content||''}`)).filter(x=>x.value);
  if(source==='fuelSources')return (c.fuelSources||['Quang Minh','Đổ ngoài']).map(x=>item(x));
  if(source==='fuelPaymentSources')return (c.fuelPaymentSources||['Quang Quân','Minh Vương','Quỹ']).map(x=>item(x));
  if(source==='chamCongTypes')return (c.chamCongTypes||[]).map(x=>item(x.name||'')).filter(x=>x.value);
  if(source==='nghiVanHanhTypes')return (c.nghiVanHanhTypes||['Mỏ báo nghỉ','Mưa','Lễ/Tết','Xe hỏng','Khác']).map(x=>item(x));
  return [];
}
function normalizeJob(value:unknown):WriteJob{const raw=value as {job?:WriteJob}&WriteJob;return raw.job||raw;}

export function EntryModule({initialCatalogs,initialError=''}:{initialCatalogs:EntryCatalogs;initialError?:string}){
  const context=useWorkbookContext(); const [form,setForm]=useState<EntryFormType>('vanChuyen'); const [catalogs,setCatalogs]=useState<Record<string,EntryCatalogs>>({vanChuyen:initialCatalogs});
  const [rows,setRows]=useState<EntryRow[]>([blank('vanChuyen')]); const [jobs,setJobs]=useState<WriteJob[]>([]); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(initialError); const [error,setError]=useState(Boolean(initialError));
  const currentCatalogs=catalogs[form]||{}; const config=FORMS[form];
  const canWrite=context.user.role==='admin'||context.user.role==='operator';
  useEffect(()=>{if(!canWrite)return;let active=true;api.get<{jobs?:WriteJob[]}>('getRecentWriteJobs',{params:{module:'transport',actionName:'submitRows',limit:'12'}}).then(res=>{if(active)setJobs((res.jobs||[]).filter(j=>['pending','processing','failed'].includes(j.status)));}).catch(()=>{});return()=>{active=false;};},[canWrite]);
  useEffect(()=>{const pending=jobs.filter(j=>j.jobId&&['pending','processing'].includes(j.status));if(!pending.length)return;const timer=window.setTimeout(()=>{Promise.all(pending.map(j=>api.get<WriteJob|{job:WriteJob}>('getWriteJobStatus',{params:{jobId:j.jobId}}).then(normalizeJob))).then(updated=>setJobs(old=>old.map(job=>updated.find(item=>item.jobId===job.jobId)||job).filter(job=>job.status!=='synced'))).catch(()=>{});},1800);return()=>window.clearTimeout(timer);},[jobs]);
  const valid=useMemo(()=>rows.every(row=>config.fields.every(([key,,,required=true])=>!required||String(row[key]||'').trim())),[rows,config]);
  const switchForm=async(type:EntryFormType)=>{setForm(type);setRows([blank(type)]);setMessage('');setError(false);if(!catalogs[type])try{const res=await api.get<EntryCatalogs&{catalogs?:EntryCatalogs}>('getCatalogs',{params:{formType:type}});setCatalogs(old=>({...old,[type]:res.catalogs||res}));}catch(loadError){setMessage(loadError instanceof Error?loadError.message:String(loadError));setError(true);}};
  const update=(index:number,key:string,value:string)=>setRows(old=>old.map((row,i)=>i===index?{...row,[key]:value}:row));
  const submit=async()=>{if(!valid){setMessage('Vui lòng điền đủ các trường bắt buộc.');setError(true);return;}setBusy(true);setError(false);setMessage('Đang gửi lệnh ghi dữ liệu…');try{const queued=normalizeJob(await api.post<WriteJob>('submitRows',{body:{formType:form,rows}}));if(!queued.jobId)throw new Error('API không trả về mã write job.');setJobs(old=>[queued,...old.filter(j=>j.jobId!==queued.jobId)].slice(0,12));setRows([blank(form)]);setMessage(`Đã nhận lệnh. Job ${queued.jobId} đang chờ đồng bộ Google Sheet.`);void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});}catch(submitError){setMessage(submitError instanceof Error?submitError.message:String(submitError));setError(true);}finally{setBusy(false);}};
  const retry=async(jobId:string)=>{try{const job=normalizeJob(await api.post<WriteJob>('retryWriteJob',{body:{jobId}}));setJobs(old=>old.map(item=>item.jobId===jobId?job:item));setMessage(`Đã đưa job ${jobId} về hàng chờ.`);void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});}catch(retryError){setMessage(retryError instanceof Error?retryError.message:String(retryError));setError(true);}};
  if(!canWrite)return <section className="entry-module"><div className="entry-card entry-permission" role="alert"><h1>Không có quyền nhập liệu</h1><p>Tài khoản cổ đông chỉ được xem dữ liệu Vận hành.</p></div></section>;
  return <section className="entry-module" data-next-entry="true" aria-labelledby="entry-title"><header className="entry-module-header"><div><p className="platform-eyebrow">VẬN TẢI · {context.workbook.year}</p><h1 id="entry-title">Nhập liệu</h1><p className={error?'entry-status error':'entry-status'} role={error?'alert':'status'} aria-live="polite">{message||'Dữ liệu được đưa vào hàng chờ an toàn trước khi ghi Google Sheet.'}</p></div></header>
    <div className="entry-tabs" role="tablist" aria-label="Loại chứng từ">{(Object.keys(FORMS) as EntryFormType[]).map(type=><button type="button" role="tab" aria-selected={form===type} className={form===type?'active':''} onClick={()=>switchForm(type)} key={type}>{FORMS[type].label}</button>)}</div>
    <section className="entry-card"><div className="entry-card-head"><div><h2>Nhập {config.label.toLocaleLowerCase('vi-VN')}</h2><p>{config.note} · {rows.length} dòng kê</p></div><div><button type="button" onClick={()=>setRows(old=>[...old,{...old.at(-1)!}])}>Nhân bản dòng cuối</button><button type="button" onClick={()=>setRows(old=>[...old,blank(form)])}>Thêm dòng</button></div></div>
      <div className="entry-rows">{rows.map((row,index)=><article className="entry-row-card" key={index}><header><strong>Dòng chứng từ {index+1}</strong><button type="button" className="entry-danger" disabled={rows.length===1} onClick={()=>setRows(old=>old.filter((_,i)=>i!==index))}>Xóa dòng</button></header><div className="entry-fields">{config.fields.map(([key,label,kind,required=true])=><label className={kind==='textarea'?'full':''} key={key}><span>{label}{required?' *':''}</span>{kind==='textarea'?<textarea value={row[key]||''} onChange={e=>update(index,key,e.target.value)}/>:['text','number','date'].includes(kind)?<input type={kind==='number'?'text':kind} inputMode={kind==='number'?'decimal':undefined} value={row[key]||''} onChange={e=>update(index,key,e.target.value)}/>:<select value={row[key]||''} onChange={e=>update(index,key,e.target.value)}><option value="">Chọn {label.toLocaleLowerCase('vi-VN')}</option>{options(currentCatalogs,kind).map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select>}</label>)}</div></article>)}</div>
      <footer className="entry-actions"><span>* Trường bắt buộc</span><button type="button" className="entry-primary" onClick={submit} disabled={busy||!valid}>{busy?'Đang gửi…':`Gửi ${rows.length} dòng`}</button></footer>
    </section>
    <section className="entry-card" aria-labelledby="job-title"><div className="entry-card-head"><div><h2 id="job-title">Trạng thái đồng bộ</h2><p>Pending → processing → synced hoặc failed</p></div></div><div className="entry-jobs">{jobs.length?jobs.map(job=><article key={job.jobId}><div><strong>{job.status}</strong><code>{job.jobId}</code>{job.lastError?<p>{job.lastError}</p>:null}</div>{job.status==='failed'?<button type="button" onClick={()=>retry(job.jobId)}>Thử lại</button>:null}</article>):<p className="entry-empty">Không có write job đang chờ hoặc lỗi.</p>}</div></section>
  </section>;
}
