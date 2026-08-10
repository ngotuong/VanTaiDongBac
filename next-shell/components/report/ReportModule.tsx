'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ReportBundle, ReportCell, ReportDataResponse, ReportMatrix } from '../../lib/platform/report-types';
import { appendTotal, filterOptions, filterOverviewMatrix, formatReportDisplayValue, formatValueLike, isTotalRow, matchesReportRow, matrixRows, normalizeMonth, parseCellValue, removeAccents, repairCompanyReport, reportMonths, reportSourceRows, stripMonthColumn, type ReportType } from '../../lib/platform/report-c2';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { exportCardAsImage, exportTableAsCsv } from '../../lib/platform/export-card';
import { showToast } from '../../lib/platform/toast';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

const TABS = [
  ['all', 'Tất Cả'],
  ['finance', 'Tổng Quan'],
  ['details', 'Chi Tiết'],
  ['payroll', 'Bảng Lương'],
  ['vehicles', 'Tổng Hợp Xe']
] as const;

const LABELS: Record<ReportType, string> = {
  finance: 'Báo Cáo Tổng Quan',
  details: 'Báo Cáo Chi Tiết',
  payroll: 'Tổng Hợp Lương',
  vehicles: 'Tổng Hợp Xe'
};
const reportResponseCache = new Map<string, ReportDataResponse>();
const reportInflight = new Map<string, Promise<ReportDataResponse>>();

async function requestReport(month: string, forceRefresh: boolean, bypassClientCache = false) {
  const key = month;
  if (!forceRefresh && !bypassClientCache && reportResponseCache.has(key)) return reportResponseCache.get(key)!;
  if (!forceRefresh && !bypassClientCache && reportInflight.has(key)) return reportInflight.get(key)!;
  const url = new URL('/report-data/', window.location.origin);
  url.searchParams.set('month', month);
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const request = (async () => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-VTDB-Client': 'next-report' } });
    const payload = await response.json().catch(() => ({})) as ReportDataResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || `Không tải được báo cáo (${response.status}).`);
    reportResponseCache.set(key, payload);
    return payload;
  })();
  if (!forceRefresh && !bypassClientCache) reportInflight.set(key, request);
  try { return await request; } finally { reportInflight.delete(key); }
}

function sticky(type: ReportType, index: number): CSSProperties | undefined {
  if (index === 0 && ['finance', 'details', 'payroll', 'vehicles'].includes(type)) return { left: 0 };
  if (type === 'vehicles' && index === 1) return { left: 120 };
  return undefined;
}

function cellStyle(type: ReportType, header: ReportCell, row: ReportCell[], index: number): CSSProperties {
  const label = String(header ?? '').toLowerCase().trim();
  const normalizedLabel = removeAccents(label);
  const category = String(row[0] ?? '').toLowerCase().trim();
  const value = parseCellValue(row[index]) || 0;
  const style: CSSProperties = { ...(sticky(type, index) || {}) };

  if (type === 'details') {
    if (index === 0) {
      Object.assign(style, { color: 'var(--deep, #062e2b)', fontWeight: 800, fontSize: '12.5px', lineHeight: 1.22, minWidth: 190, width: 190, maxWidth: 190, overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap' });
    } else if (label.includes('giải thích') || label.includes('nội dung')) {
      Object.assign(style, { color: 'var(--ink, #0f172a)', fontWeight: 500, fontSize: 12, lineHeight: 1.28, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' });
    } else if (category.includes('thuế') || category.includes('phí') || category.includes('chi') || category.includes('dầu')) {
      Object.assign(style, { color: '#dc2626', fontWeight: 600 });
    } else if (category.includes('khối lượng')) {
      Object.assign(style, { color: '#0d9488', fontWeight: 600 });
    } else if (category.includes('doanh thu') || category.includes('lợi nhuận') || category.includes('lãi gộp') || category.includes('lợi nhuận thực')) {
      Object.assign(style, { color: value < 0 ? '#dc2626' : '#0284c7', fontWeight: 700 });
    } else if (category.includes('thu nhập') || category.includes('thu')) {
      Object.assign(style, { color: '#0284c7', fontWeight: 700 });
    } else {
      Object.assign(style, { color: 'var(--ink, #0f172a)', fontWeight: 600 });
    }
    if (normalizedLabel.includes('quang quan') || normalizedLabel.includes('minh vuong')) {
      Object.assign(style, { fontSize: '12.5px', lineHeight: 1.3, fontWeight: 600 });
    }
  } else if (type === 'finance') {
    if (label.includes('thuế') || label.includes('chi') || label.includes('dầu') || label.includes('phí')) {
      Object.assign(style, { color: '#dc2626', fontWeight: 600 });
    } else if (label.includes('khối lượng')) {
      Object.assign(style, { color: '#0d9488', fontWeight: 600 });
    } else if (label.includes('doanh thu') || label.includes('lợi nhuận') || label.includes('gộp')) {
      Object.assign(style, { color: value < 0 ? '#dc2626' : '#0284c7', fontWeight: 700 });
    } else {
      Object.assign(style, { color: 'var(--ink, #0f172a)', fontWeight: 600 });
    }
  } else if (type === 'payroll') {
    if (index === 0) {
      Object.assign(style, { fontWeight: 700, color: 'var(--deep)' });
    } else if (label.includes('thực nhận') || label.includes('tổng lương') || label.includes('thưởng')) {
      Object.assign(style, { color: '#0284c7', fontWeight: 700 });
    } else if (label.includes('phạt') || label.includes('ứng lương') || label.includes('trừ')) {
      Object.assign(style, { color: '#dc2626', fontWeight: 600 });
    } else {
      Object.assign(style, { color: 'var(--ink, #0f172a)', fontWeight: 600 });
    }
  } else if (type === 'vehicles') {
    if (index === 0) {
      Object.assign(style, { fontWeight: 700, color: 'var(--deep)', minWidth: 120, width: 120, maxWidth: 120 });
    } else if (index === 1) {
      Object.assign(style, { fontWeight: 700, color: 'var(--deep)', minWidth: 105, width: 105, maxWidth: 105 });
    } else if (label.includes('doanh thu') || label.includes('lợi nhuận') || label.includes('lãi gộp')) {
      Object.assign(style, { color: value < 0 ? '#dc2626' : '#0284c7', fontWeight: 700 });
    } else if (label.includes('chi phí') || label.includes('dầu') || label.includes('sửa chữa') || label.includes('phí')) {
      Object.assign(style, { color: '#dc2626', fontWeight: 600 });
    } else {
      Object.assign(style, { color: 'var(--ink, #0f172a)', fontWeight: 600 });
    }
  }
  return style;
}

function ActionButton({ kind, title, onClick }: { kind: 'image' | 'csv'; title: string; onClick: (button: HTMLButtonElement) => void }) {
  return <button type="button" className="c2-card-action-button" title={kind === 'image' ? 'Xuất ảnh' : 'Xuất Excel'} aria-label={`${kind === 'image' ? 'Xuất ảnh' : 'Xuất Excel'} ${title}`} onClick={(event) => onClick(event.currentTarget)}>
    {kind === 'image' ? <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> : <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h8M8 9h2"/></svg>}
  </button>;
}

function ReportTable({ type, matrix, query, month }: { type: ReportType; matrix: ReportMatrix | undefined; query: string; month: string }) {
  const parsed = useMemo(() => matrixRows(matrix), [matrix]);
  const prepared = useMemo(() => stripMonthColumn(type, parsed.head, parsed.body), [parsed, type]);
  const options = useMemo(() => filterOptions(type, prepared.head, prepared.body), [type, prepared]);
  const [company, setCompany] = useState('');
  const [plate, setPlate] = useState('');
  const effectiveCompany = company && options.companies.includes(company) ? company : '';
  const effectivePlate = plate && options.plates.includes(plate) ? plate : '';
  const dataRows = useMemo(() => reportSourceRows(type, prepared.body).filter((row) => {
    if (type !== 'payroll' && type !== 'vehicles') return true;
    if (!matchesReportRow(row, query)) return false;
    if (effectiveCompany && String(row[options.companyIdx] ?? '') !== effectiveCompany) return false;
    return !(type === 'vehicles' && effectivePlate && String(row[options.plateIdx] ?? '') !== effectivePlate);
  }), [prepared.body, type, query, effectiveCompany, effectivePlate, options]);
  const shouldTotal = type === 'finance' ? month === 'Tất cả' : type === 'payroll' || type === 'vehicles';
  const visibleRows = shouldTotal ? appendTotal(prepared.head, dataRows) : dataRows;
  const explanation = (cell: ReportCell) => { const value = String(cell ?? '').toLowerCase(); return value.includes('giải thích') || value.includes('nội dung'); };
  const companyDetail = (cell: ReportCell) => type === 'details' && ['quang quan', 'minh vuong'].some((name) => removeAccents(String(cell ?? '').toLowerCase()).includes(name));

  return <section className="table-card high-density-table" data-report-type={type} aria-labelledby={`report-title-${type}`}>
    <div className="table-card-head report-table-head">
      <div><div className="table-title" id={`report-title-${type}`}>{LABELS[type]} <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({month === 'Tất cả' ? 'Tất cả tháng' : month})</span></div></div>
      <div className="report-card-actions">
        <ActionButton kind="image" title={type} onClick={(button) => void exportCardAsImage(button, type)}/>
        <ActionButton kind="csv" title={type} onClick={(button) => exportTableAsCsv(button, type)}/>
      </div>
    </div>
    {type === 'payroll' && options.companyIdx >= 0 ? (
      <div className="table-card-subhead">
        <label className="compact-filter">
          <select className="report-payroll-filter platform-content-select" aria-label="Lọc công ty bảng lương" value={effectiveCompany} onChange={(event) => setCompany(event.target.value)}>
            <option value="">Tất cả công ty</option>
            {options.companies.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
      </div>
    ) : null}
    {type === 'vehicles' ? (
      <div className="table-card-subhead">
        <label className="compact-filter">
          <select className="report-vehicle-filter platform-content-select" aria-label="Lọc công ty tổng hợp xe" value={effectiveCompany} onChange={(event) => setCompany(event.target.value)}>
            <option value="">Tất cả công ty</option>
            {options.companies.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="compact-filter">
          <select className="report-vehicle-filter platform-content-select" aria-label="Lọc biển số xe" value={effectivePlate} onChange={(event) => setPlate(event.target.value)}>
            <option value="">Tất cả xe</option>
            {options.plates.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
      </div>
    ) : null}
    <div className="table-wrap" tabIndex={0} aria-label={`${LABELS[type]} — cuộn ngang để xem đủ cột`}>
      <table className={`report-data-table report-data-table-${type}`}>
        {type === 'details' ? <colgroup>{prepared.head.map((cell, index) => <col key={index} style={index === 0 ? { width: 190, minWidth: 190 } : explanation(cell) ? { width: 300, minWidth: 300 } : { width: 142, minWidth: 142 }}/>)}</colgroup> : null}
        <thead><tr>{prepared.head.map((cell, index) => <th scope="col" key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(cell) ? ' report-detail-explanation-head' : ''}`.trim()} style={sticky(type, index)}>{String(cell ?? '')}</th>)}</tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map((row, rowIndex) => { const total = isTotalRow(row); const grand = total && rowIndex === visibleRows.length - 1; return <tr key={rowIndex} className={type !== 'details' && total ? `total-row${grand ? ' grand-total-row' : ''}` : undefined} style={{ fontWeight: total ? 800 : 500, fontSize: total ? 13 : 12.5, color: total ? 'var(--deep)' : undefined }}>{prepared.head.map((header, index) => <td key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(header) ? ' report-detail-explanation-cell' : ''}${companyDetail(header) ? ' report-detail-company-cell' : ''}${index > 0 ? ' tabular-nums' : ''}`.trim()} style={cellStyle(type, header, row, index)}>{formatReportDisplayValue(type, header, row, index)}</td>)}</tr>; }) : <tr><td colSpan={Math.max(1, prepared.head.length)} className="report-c2-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export function ReportModule({ initialBundle, initialVehicleOwners = {}, initialError = '' }: { initialBundle: ReportBundle | null; initialVehicleOwners?: Record<string, string>; initialError?: string }) {
  const initialMonths = reportMonths(initialBundle?.overview?.months);
  const [bundle, setBundle] = useState(initialBundle);
  const [vehicleOwners, setVehicleOwners] = useState(initialVehicleOwners);
  const [month, setMonth] = useState(normalizeMonth(initialMonths.at(-1) || 'Tất cả'));
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState(initialBundle ? (initialBundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.') : '');
  const loadSequence = useRef(0);
  const visibleMonthRef = useRef(month);
  useEffect(() => { visibleMonthRef.current = month; }, [month]);
  const months = useMemo(() => reportMonths(bundle?.overview?.months), [bundle]);
  const finance = useMemo(() => filterOverviewMatrix(bundle?.overview?.months, month), [bundle, month]);
  const repairedCompanyReport = useMemo(() => repairCompanyReport(bundle?.overview?.details, bundle?.vehicles, vehicleOwners), [bundle, vehicleOwners]);
  const matrices: Record<ReportType, ReportMatrix | undefined> = { finance, details: repairedCompanyReport.details, payroll: bundle?.payroll, vehicles: repairedCompanyReport.vehicles };
  const visibleTypes: ReportType[] = tab === 'all' ? ['finance', 'details', 'payroll', 'vehicles'] : [tab];

  useEffect(() => {
    publishDataSourceMeta(bundle);
  }, [bundle]);

  const load = async (target: string, forceRefresh = false, announce = false) => {
    const sequence = ++loadSequence.current;
    const normalizedTarget = normalizeMonth(target);
    if (normalizedTarget !== 'latest') setMonth(normalizedTarget);
    setLoading(true); setError(''); setStatus('Đang tải báo cáo…');
    if (forceRefresh || announce) showToast(forceRefresh ? 'Đang đối soát Báo cáo từ Google Sheet…' : 'Đang tải Báo cáo từ Supabase…', 'loading');
    try {
      const data = await requestReport(normalizedTarget, forceRefresh, announce);
      if (sequence !== loadSequence.current) return;
      setBundle(data.bundle);
      setVehicleOwners(data.vehicleOwners || {});
      const loadedMonths = reportMonths(data.bundle.overview?.months);
      setMonth(normalizedTarget === 'latest' ? normalizeMonth(loadedMonths.at(-1) || 'Tất cả') : normalizedTarget);
      setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
      if (forceRefresh || announce) showToast('Dữ liệu Báo cáo đã được cập nhật.', 'success');
    } catch (loadError) {
      if (sequence !== loadSequence.current) return;
      const message = loadError instanceof Error ? loadError.message : String(loadError); setError(message); setStatus(''); showToast(message, 'error');
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  };

  useVisibleRevalidation(async () => {
    if (loading) return;
    const targetMonth = visibleMonthRef.current;
    const data = await requestReport(targetMonth, false, true);
    if (visibleMonthRef.current !== targetMonth) return;
    setBundle(data.bundle);
    setVehicleOwners(data.vehicleOwners || {});
    setError('');
    setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
  }, !loading);

  return <section id="reportsView" className="view active" data-next-report="true">
    <button type="button" data-shell-refresh hidden onClick={() => load(month, false, true)} aria-hidden="true" tabIndex={-1}/>
    <div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar" role="tablist" aria-label="Loại báo cáo">{TABS.map(([type, label]) => <button type="button" role="tab" aria-selected={tab === type} className={`sub-tab${tab === type ? ' active' : ''}`} data-report-tab={type} onClick={() => setTab(type)} key={type}>{label}</button>)}</div>
    <section className="panel report-filter-panel app-sticky-toolbar sticky-after-tabs">
      <div className="panel-head reports-filter-head"><div className="filter-row reports-filter-row"><input type="search" id="reportSearchInput" aria-label="Tìm trong báo cáo" placeholder="Tìm xe, tài xế..." value={query} onChange={(event) => setQuery(event.target.value)}/><select id="reportMonthFilter" className="cashflow-quick-period-select platform-content-select" aria-label="Chọn tháng báo cáo" aria-busy={loading || undefined} value={month} onChange={(event) => void load(event.target.value)}><option value="Tất cả">Tất cả tháng</option>{months.filter((value) => value !== 'Tất cả').map((value) => <option value={normalizeMonth(value)} key={value}>{normalizeMonth(value)}</option>)}</select></div></div>
    </section>
    <div className="platform-visually-hidden" role="status" aria-live="polite">{error || status}</div>
    {error && !bundle ? <section className="table-card report-c2-error" role="alert"><div className="panel-body"><div className="table-title">Không tải được báo cáo</div><p>{error}</p><button type="button" className="sub-tab" onClick={() => load('latest')} disabled={loading}>Thử lại</button></div></section> : null}
    {loading && !bundle ? <div className="report-stack" aria-busy="true" aria-label="Đang tải báo cáo">{(['finance', 'details', 'payroll', 'vehicles'] as ReportType[]).map((type) => <section className="table-card" key={type}><div className="table-card-head"><div><div className="table-title">{LABELS[type]}</div><div className="panel-note report-month-note">Đang tải báo cáo từ Supabase.</div></div></div><div className="panel-body"><div className="shimmer shimmer-table"/></div></section>)}</div> : null}
    {bundle ? <div className="report-stack" id="reports">{visibleTypes.map((type) => <ReportTable type={type} matrix={matrices[type]} query={query} month={month} key={`${type}-${month}`}/>)}</div> : null}
  </section>;
}

export { matrixRows, formatValueLike };
