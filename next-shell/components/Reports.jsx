'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { createBrowserReportTransport, createReportClient } from '../lib/report-client.js';
import { getReportAccessToken } from '../lib/report-auth.js';

const tabs = [['all','Tất Cả'],['finance','Tổng Quan'],['details','Chi Tiết'],['payroll','Bảng Lương'],['vehicles','Tổng Hợp Xe']];
const labels = { finance:'Báo cáo tổng quan', details:'Báo cáo chi tiết', payroll:'Tổng hợp lương', vehicles:'Tổng hợp xe' };
const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"','""')}"`;
function matrixRows(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim()));
  return headerIndex < 0 ? { head:[], body:[] } : { head:rows[headerIndex], body:rows.slice(headerIndex + 1).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim())) };
}
function reportMonths(bundle) {
  const { body } = matrixRows(bundle?.overview?.months);
  return [...new Set(body.map(row => String(row?.[0] || '').trim()).filter(Boolean))];
}
function ReportTable({ type, matrix, query }) {
  const { head, body } = matrixRows(matrix);
  const normalized = query.trim().toLocaleLowerCase('vi-VN');
  const visible = normalized ? body.filter(row => row.join(' ').toLocaleLowerCase('vi-VN').includes(normalized)) : body;
  const exportCsv = () => {
    const csv = [head, ...visible].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' })); link.download = `${type}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <section className="table-card next-report-card" data-report-type={type}><div className="table-card-head"><div className="table-title">{labels[type]}</div><button type="button" className="secondary" onClick={exportCsv} disabled={!head.length}>Xuất CSV</button></div><div className="table-wrap next-report-table-wrap"><table className="report-table"><thead><tr>{head.map((cell,index)=><th key={index}>{String(cell ?? '')}</th>)}</tr></thead><tbody>{visible.length ? visible.map((row,rowIndex)=><tr key={rowIndex}>{head.map((_,index)=><td key={index}>{String(row?.[index] ?? '')}</td>)}</tr>) : <tr><td colSpan={Math.max(1,head.length)} className="next-report-empty">Không có dữ liệu phù hợp.</td></tr>}</tbody></table></div></section>;
}

export default function Reports({ bridge }) {
  if (bridge) return <LegacyReports bridge={bridge}/>;
  return <StandaloneReports/>;
}
function LegacyReports({ bridge }) { return <div data-react-reports="true"><div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar">{tabs.map(([type,label], index) => <button type="button" className={`sub-tab${index === 0 ? ' active' : ''}`} data-report-tab={type} onClick={() => bridge?.setReportTab?.(type)} key={type}>{label}</button>)}</div><section className="panel report-filter-panel app-sticky-toolbar sticky-after-tabs"><div className="panel-head reports-filter-head"><div className="filter-row reports-filter-row"><input type="text" id="reportSearchInput" placeholder="Tìm xe, tài xế..." onInput={() => bridge?.debounceReportSearch?.()}/><select id="reportMonthFilter" aria-label="Chọn tháng báo cáo"/></div></div></section><div className="report-stack" id="reports"><div className="table-card"><div className="panel-body"><div className="shimmer shimmer-table"/></div></div></div></div>; }

function StandaloneReports() {
  const [bundle,setBundle]=useState(null), [month,setMonth]=useState('latest'), [tab,setTab]=useState('all'), [query,setQuery]=useState(''), [status,setStatus]=useState('Đang tải báo cáo…'), [error,setError]=useState('');
  const client = useMemo(() => createReportClient(createBrowserReportTransport(getReportAccessToken)), []);
  const load = async (target=month, force=false) => { setError(''); setStatus('Đang tải báo cáo…'); try { const data=await client.getBundle(target,force); setBundle(data); setStatus(data.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.'); } catch(err) { setError(err.message || String(err)); setStatus(''); } };
  useEffect(() => { load('latest',false); }, []);
  const months = reportMonths(bundle);
  const matrices = { finance:bundle?.overview?.months || [], details:bundle?.overview?.details || [], payroll:bundle?.payroll || [], vehicles:bundle?.vehicles || [] };
  const visibleTypes = tab === 'all' ? ['finance','details','payroll','vehicles'] : [tab];
  return <div data-next-report="true"><header className="next-report-header"><div><p className="next-report-eyebrow">VẬN TẢI ĐÔNG BẮC</p><h1>Báo cáo</h1><p className="next-report-status" role="status">{error || status}</p></div><button type="button" className="secondary" onClick={()=>load(month,true)}>Làm mới</button></header><div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar">{tabs.map(([type,label])=><button type="button" className={`sub-tab${tab===type?' active':''}`} data-report-tab={type} onClick={()=>setTab(type)} key={type}>{label}</button>)}</div><section className="panel report-filter-panel"><div className="panel-head reports-filter-head"><div className="filter-row reports-filter-row"><input type="search" id="reportSearchInput" aria-label="Tìm trong báo cáo" placeholder="Tìm xe, tài xế..." value={query} onChange={e=>setQuery(e.target.value)}/><select id="reportMonthFilter" aria-label="Chọn tháng báo cáo" value={month} onChange={e=>{setMonth(e.target.value);load(e.target.value,false)}}><option value="latest">Tháng gần nhất</option><option value="Tất cả">Tất cả</option>{months.filter(item=>item!=='Tất cả').map(item=><option value={item} key={item}>{item}</option>)}</select></div></div></section>{error ? <section className="info-card next-report-error"><h2>Không tải được báo cáo</h2><p>{error}</p><a href="/">Quay lại ứng dụng chính để đăng nhập</a></section> : <div className="report-stack" id="reports">{bundle ? visibleTypes.map(type=><ReportTable type={type} matrix={matrices[type]} query={query} key={type}/>) : <div className="table-card"><div className="panel-body"><div className="shimmer shimmer-table"/></div></div>}</div>}</div>;
}

export { matrixRows, reportMonths };
