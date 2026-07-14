'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import type { ManageBundle, ManageDataResponse, ManageRow, ManageSheetName } from '../../lib/platform/manage-types';
import { createClientApiClient } from '../../lib/platform/client-api-client';

const SHEETS: Array<[ManageSheetName, string]> = [['NL_VanChuyen','Vận chuyển'],['NL_TaiXe','Tài xế'],['NL_Dau','Xăng dầu'],['NL_ChamCong','Chấm công'],['NL_Phat','Phạt nội bộ'],['NL_NghiVanHanh','Nghỉ vận hành']];
const PAGE_SIZE = 20;
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function rangeFor(mode: string) {
  const today = new Date();
  if (mode === 'today') return [iso(today), iso(today)];
  if (mode === '7days') { const start = new Date(today); start.setDate(today.getDate()-6); return [iso(start), iso(today)]; }
  if (mode === 'thisMonth') return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)];
  if (mode === 'lastMonth') return [iso(new Date(today.getFullYear(), today.getMonth()-1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))];
  return ['', ''];
}
function visibleColumns(headers: string[], sheet: ManageSheetName) {
  return headers.map((header, index) => ({ header: normalize(header), index })).filter(({ header }) => header !== 'thang' && !(sheet === 'NL_ChamCong' && ['loai ngay cong hop le','luu y'].includes(header))).map(({ index }) => index);
}
function display(value: unknown, header: string) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  const text = String(value);
  if ((normalize(header).includes('ngay') || /^\d{4}-\d{2}-\d{2}/.test(text)) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0,10).split('-'); return `${day}/${month}/${year}`;
  }
  return text;
}
function column(headers: string[], names: string[]) { return headers.findIndex((header) => names.includes(normalize(header))); }
async function requestManage(sheetName: ManageSheetName, startDate: string, endDate: string, forceRefresh = false): Promise<ManageDataResponse> {
  const url = new URL('/manage-data/', window.location.origin);
  url.searchParams.set('sheetName', sheetName); if (startDate) url.searchParams.set('startDate', startDate); if (endDate) url.searchParams.set('endDate', endDate); if (forceRefresh) url.searchParams.set('forceRefresh','true');
  const response = await fetch(url, { credentials:'same-origin', cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Không tải được dữ liệu (${response.status}).`);
  return payload;
}

export function ManageReadOnlyModule({ initialData, initialError = '' }: { initialData: ManageDataResponse | null; initialError?: string }) {
  const context = useWorkbookContext();
  const api = createClientApiClient();
  const [data, setData] = useState<ManageBundle | null>(initialData?.data || null);
  const [sheet, setSheet] = useState<ManageSheetName>(initialData?.sheetName || 'NL_VanChuyen');
  const [period, setPeriod] = useState('recent'); const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState('');
  const [query, setQuery] = useState(''); const [fuelSource, setFuelSource] = useState('all'); const [paymentSource, setPaymentSource] = useState('all'); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(initialError);
  const [notice,setNotice]=useState(''); const [saving,setSaving]=useState(false); const [editing,setEditing]=useState<ManageRow|null>(null); const [draft,setDraft]=useState<Record<string,string>>({});
  const headers = data?.headers || []; const columns = visibleColumns(headers, sheet);
  const fuelIndex = column(headers, ['nguon','nguon cung cap','nguon dau']); const paymentIndex = column(headers, ['nguon chi']);
  const rows = useMemo(() => (data?.rows || []).filter((row) => {
    if (query && !normalize(row.values.join(' ')).includes(normalize(query))) return false;
    if (sheet === 'NL_Dau' && fuelSource !== 'all' && fuelIndex >= 0 && normalize(row.values[fuelIndex]) !== normalize(fuelSource)) return false;
    if (sheet === 'NL_Dau' && paymentSource !== 'all' && paymentIndex >= 0 && !normalize(row.values[paymentIndex]).includes(normalize(paymentSource))) return false;
    return true;
  }), [data, query, sheet, fuelSource, paymentSource, fuelIndex, paymentIndex]);
  const totalPages = Math.max(1, Math.ceil(rows.length/PAGE_SIZE)); const currentPage = Math.min(page,totalPages); const pageRows = rows.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const source = data?.supabaseCached ? (data.supabaseMonthlyCached ? 'Supabase cache tháng' : 'Supabase cache gần nhất') : 'Apps Script';

  const load = async (targetSheet: ManageSheetName, start = startDate, end = endDate, force = false) => {
    setLoading(true); setError('');
    try { const response = await requestManage(targetSheet,start,end,force); setData(response.data); setSheet(response.sheetName); setPage(1); setQuery(''); setFuelSource('all'); setPaymentSource('all'); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)); }
    finally { setLoading(false); }
  };
  const changePeriod = (mode: string) => { setPeriod(mode); if (mode === 'custom') return; const [start,end]=rangeFor(mode); setStartDate(start); setEndDate(end); void load(sheet,start,end); };
  const rowObject=(row:ManageRow)=>Object.fromEntries(headers.map((header,index)=>[header,row.values[index]??'']));
  const openEdit=(row:ManageRow)=>{setEditing(row);setDraft(Object.fromEntries(headers.map((header,index)=>{const value=String(row.values[index]??'');return[header,/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):value];})));};
  const save=async()=>{if(!editing)return;setSaving(true);setError('');try{const previousRowData=rowObject(editing);await api.post('saveSheetRow',{body:{sheetName:sheet,rowIndex:editing.rowIndex,rowData:draft,previousRowData}});setEditing(null);setNotice(`Đã nhận lệnh sửa dòng ${editing.rowIndex}; dữ liệu đang đồng bộ Google Sheet.`);void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});await load(sheet,startDate,endDate,true);}catch(saveError){setError(saveError instanceof Error?saveError.message:String(saveError));}finally{setSaving(false);}};
  const remove=async(row:ManageRow)=>{if(!window.confirm(`Bạn có chắc chắn muốn xóa dữ liệu dòng thứ ${row.rowIndex} không? Hành động này không thể hoàn tác.`))return;setSaving(true);setError('');try{await api.post('deleteSheetRow',{body:{sheetName:sheet,rowIndex:row.rowIndex,columnsToClear:headers,rowData:rowObject(row)}});setNotice(`Đã nhận lệnh xóa dữ liệu dòng ${row.rowIndex}; dữ liệu đang đồng bộ Google Sheet.`);void api.post('processWriteJobs',{body:{maxJobs:2}}).catch(()=>{});await load(sheet,startDate,endDate,true);}catch(deleteError){setError(deleteError instanceof Error?deleteError.message:String(deleteError));}finally{setSaving(false);}};

  return <section className="manage-module" data-next-manage-readonly="true" aria-labelledby="manage-page-title">
    <header className="manage-module-header"><div><p className="platform-eyebrow">VẬN TẢI · {context.workbook.year}</p><h1 id="manage-page-title">Vận hành</h1><p className="manage-module-status" role="status" aria-live="polite">{error || (data ? `Chỉ đọc · Nguồn: ${source}${data.supabaseSyncedAt ? ` · đồng bộ ${data.supabaseSyncedAt}` : ''}` : '')}</p></div><div className="manage-module-header-actions">{context.user.role !== 'shareholder' ? <Link href="/entry" prefetch={false}>Nhập mới</Link> : null}<button type="button" data-shell-refresh onClick={() => load(sheet,startDate,endDate,true)} disabled={loading}>{loading?'Đang tải…':'Làm mới'}</button></div></header>
    <div className="manage-module-tabs" role="tablist" aria-label="Nhật ký vận hành">{SHEETS.map(([name,label]) => <button type="button" role="tab" aria-selected={sheet===name} className={sheet===name?'active':''} onClick={() => load(name)} disabled={loading} key={name}>{label}</button>)}</div>
    <div className="manage-module-filters">
      <label><span>Kỳ lọc</span><select value={period} onChange={(event)=>changePeriod(event.target.value)} disabled={loading}><option value="recent">Gần đây</option><option value="today">Hôm nay</option><option value="7days">7 ngày qua</option><option value="thisMonth">Tháng này</option><option value="lastMonth">Tháng trước</option><option value="custom">Tùy chọn</option></select></label>
      {period==='custom'?<><label><span>Từ ngày</span><input type="date" value={startDate} onChange={(event)=>setStartDate(event.target.value)}/></label><label><span>Đến ngày</span><input type="date" value={endDate} onChange={(event)=>setEndDate(event.target.value)}/></label><button type="button" onClick={()=>load(sheet,startDate,endDate)} disabled={loading}>Áp dụng</button></>:null}
      <label className="manage-module-search"><span>Tìm kiếm</span><input type="search" value={query} placeholder="Biển số, tài xế, dự án…" onChange={(event)=>{setQuery(event.target.value);setPage(1);}}/></label>
      {sheet==='NL_Dau'?<><label><span>Nguồn dầu</span><select value={fuelSource} onChange={(event)=>{setFuelSource(event.target.value);setPage(1);}}><option value="all">Tất cả</option><option>Quang Minh</option><option>Đổ ngoài</option></select></label><label><span>Nguồn chi</span><select value={paymentSource} onChange={(event)=>{setPaymentSource(event.target.value);setPage(1);}}><option value="all">Tất cả</option><option>Quang Quân</option><option>Minh Vương</option><option>Quỹ</option></select></label></>:null}
      {context.user.role!=='shareholder'?<Link className="manage-entry-button" href="/entry" prefetch={false}>＋ Nhập mới</Link>:null}
    </div>
    {notice?<p className="manage-parity-notice" role="status">{notice}</p>:null}
    {error && !data?<div className="manage-module-error" role="alert"><h2>Không tải được dữ liệu Vận hành</h2><p>{error}</p><button type="button" onClick={()=>load(sheet,startDate,endDate)}>Thử lại</button></div>:null}
    {loading && !data?<div className="manage-module-skeleton" aria-busy="true" aria-label="Đang tải dữ liệu Vận hành"><span/><span/><span/></div>:null}
    {data?<section className="manage-module-card" aria-labelledby="manage-table-title"><div className="manage-module-card-head"><div><h2 id="manage-table-title">{SHEETS.find(([name])=>name===sheet)?.[1]}</h2><p>{rows.length} dòng phù hợp{data.isLimited?' · phạm vi cache giới hạn':''}</p></div></div>
      <div className="manage-module-table-wrap" tabIndex={0} aria-label="Bảng Vận hành — cuộn ngang để xem đủ cột"><table><thead><tr><th scope="col">Dòng Sheet</th>{columns.map((index)=><th scope="col" key={index}>{headers[index]}</th>)}{context.user.role!=='shareholder'?<th scope="col">Thao tác</th>:null}</tr></thead><tbody>{pageRows.length?pageRows.map((row:ManageRow)=><tr key={row.rowIndex}><td>{row.rowIndex}</td>{columns.map((index)=><td key={index}>{display(row.values[index],headers[index])}</td>)}{context.user.role!=='shareholder'?<td><div className="manage-row-actions"><button type="button" aria-label={`Sửa dòng ${row.rowIndex}`} title="Sửa" onClick={()=>openEdit(row)}>Sửa</button><button type="button" className="danger" aria-label={`Xóa dòng ${row.rowIndex}`} title="Xóa" onClick={()=>void remove(row)} disabled={saving}>Xóa</button></div></td>:null}</tr>):<tr><td colSpan={Math.max(1,columns.length+(context.user.role!=='shareholder'?2:1))} className="manage-module-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>}</tbody></table></div>
      <footer className="manage-module-pagination"><span>{rows.length?`Đang hiển thị ${(currentPage-1)*PAGE_SIZE+1}-${Math.min(currentPage*PAGE_SIZE,rows.length)} trên ${rows.length}`:'Hiển thị 0-0 trên 0'}</span><div><button type="button" onClick={()=>setPage(Math.max(1,currentPage-1))} disabled={currentPage<=1}>← Trước</button><button type="button" onClick={()=>setPage(Math.min(totalPages,currentPage+1))} disabled={currentPage>=totalPages}>Sau →</button></div></footer>
    </section>:null}
    {editing?<div className="manage-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!saving)setEditing(null);}}><section className="manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-edit-title"><header><h2 id="manage-edit-title">Chỉnh sửa dòng thứ {editing.rowIndex}</h2><button type="button" aria-label="Đóng" onClick={()=>setEditing(null)} disabled={saving}>×</button></header><div className="manage-edit-form">{headers.filter((header)=>normalize(header)!=='thang').map((header)=><label key={header}><span>{header}</span><input type={normalize(header).includes('ngay')?'date':'text'} value={draft[header]??''} onChange={(event)=>setDraft({...draft,[header]:event.target.value})}/></label>)}</div><footer><button type="button" onClick={()=>setEditing(null)} disabled={saving}>Hủy bỏ</button><button type="button" className="manage-save-button" onClick={()=>void save()} disabled={saving}>{saving?'Đang lưu…':'Lưu lại'}</button></footer></section></div>:null}
  </section>;
}
