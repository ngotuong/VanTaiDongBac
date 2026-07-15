'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ReportBundle, ReportCell, ReportDataResponse, ReportMatrix } from '../../lib/platform/report-types';
import { appendTotal, filterOptions, filterOverviewMatrix, formatValueLike, isTotalRow, matchesReportRow, matrixRows, parseCellValue, reportMonths, reportSourceRows, stripMonthColumn, type ReportType } from '../../lib/platform/report-c2';
import { exportCardAsImage, exportTableAsCsv } from '../../lib/platform/export-card';

const TABS = [
  ['all', 'Tất Cả'],
  ['finance', 'Tổng Quan'],
  ['details', 'Chi Tiết'],
  ['payroll', 'Bảng Lương'],
  ['vehicles', 'Tổng Hợp Xe']
] as const;

const LABELS: Record<ReportType, string> = {
  finance: 'Báo cáo tổng quan',
  details: 'Báo cáo chi tiết',
  payroll: 'Tổng hợp lương',
  vehicles: 'Tổng hợp xe'
};

async function requestReport(month: string, forceRefresh: boolean) {
  const url = new URL('/report-data/', window.location.origin);
  url.searchParams.set('month', month);
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-VTDB-Client': 'next-report' } });
  const payload = await response.json().catch(() => ({})) as ReportDataResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Không tải được báo cáo (${response.status}).`);
  return payload;
}

function sticky(type: ReportType, index: number): CSSProperties | undefined {
  if (index === 0 && ['finance', 'details', 'payroll', 'vehicles'].includes(type)) return { left: 0 };
  if (type === 'vehicles' && index === 1) return { left: 90 };
  return undefined;
}

function cellStyle(type: ReportType, header: ReportCell, row: ReportCell[], index: number): CSSProperties {
  const label = String(header ?? '').toLowerCase().trim();
  const category = String(row[0] ?? '').toLowerCase().trim();
  const value = parseCellValue(row[index]) || 0;
  const style: CSSProperties = { ...(sticky(type, index) || {}) };
  if (type === 'details') {
    if (index === 0) Object.assign(style, { color: 'var(--ink)', fontWeight: 800, fontSize: '12.5px', lineHeight: 1.22, maxWidth: 156, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    else if (label.includes('giải thích') || label.includes('nội dung')) Object.assign(style, { color: 'var(--ink)', fontWeight: 500, fontSize: 12, lineHeight: 1.28, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' });
    else if (category.includes('khối lượng')) Object.assign(style, { color: '#0D9488', fontWeight: 600 });
    else if (category.includes('thuế') || category.includes('phí đường bộ') || category.includes('phí đi đường')) Object.assign(style, { color: 'var(--red)', fontWeight: 600 });
    else if (category.includes('doanh thu') || category.includes('lợi nhuận') || category.includes('thu')) Object.assign(style, { color: value < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 });
    else if (category.includes('chi phí') || category.includes('chi quỹ') || category.includes('dầu') || category.includes('chi')) Object.assign(style, { color: 'var(--red)', fontWeight: 600 });
  } else if (type === 'finance') {
    if (label.includes('khối lượng')) Object.assign(style, { color: '#0D9488', fontWeight: 800 });
    else if (label.includes('doanh thu') || label.includes('lợi nhuận') || label.includes('gộp')) Object.assign(style, { color: value < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 });
    else if (label.includes('chi') || label.includes('thuế') || label.includes('dầu') || label.includes('phí')) Object.assign(style, { color: 'var(--red)', fontWeight: 600 });
  } else if (type === 'payroll') {
    if (index === 0) Object.assign(style, { fontWeight: 700, color: 'var(--deep)' });
    else if (label.includes('thực nhận') || label.includes('tổng lương') || label.includes('thưởng')) Object.assign(style, { color: 'var(--green)', fontWeight: 600 });
    else if (label.includes('phạt') || label.includes('ứng lương')) Object.assign(style, { color: 'var(--red)', fontWeight: 600 });
  } else if (type === 'vehicles') {
    if (label.includes('công ty') || label.includes('chủ xe') || label.includes('nhà xe') || label.includes('đơn vị') || index === 2) Object.assign(style, { fontWeight: 700, color: 'var(--deep)' });
    else if (label.includes('lợi nhuận') || label.includes('lãi gộp') || label.includes('doanh thu')) Object.assign(style, { color: value < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 });
    else if (label.includes('chi phí') || label.includes('dầu') || label.includes('sửa chữa')) Object.assign(style, { color: 'var(--red)', fontWeight: 600 });
  }
  return style;
}

function ActionButton({ kind, title, onClick }: { kind: 'image' | 'csv'; title: string; onClick: (button: HTMLButtonElement) => void }) {
  return <button type="button" className="sub-tab c2-card-action-button" title={kind === 'image' ? 'Xuất ảnh' : 'Xuất Excel'} aria-label={`${kind === 'image' ? 'Xuất ảnh' : 'Xuất Excel'} ${title}`} onClick={(event) => onClick(event.currentTarget)}>
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

  return <section className="table-card" data-report-type={type} aria-labelledby={`report-title-${type}`}>
    <div className="table-card-head report-table-head">
      <div><div className="table-title" id={`report-title-${type}`}>{LABELS[type]}</div><div className="panel-note report-month-note">{month === 'Tất cả' ? 'Tất cả tháng' : `Tháng ${month}`}</div></div>
      <div className="report-card-actions">
        {type === 'payroll' && options.companyIdx >= 0 ? <div className="payroll-summary-filters"><label className="compact-filter compact-filter-inline"><select className="report-payroll-filter" aria-label="Lọc công ty bảng lương" value={effectiveCompany} onChange={(event) => setCompany(event.target.value)}><option value="">Tất cả</option>{options.companies.map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div> : null}
        {type === 'vehicles' ? <div className="vehicle-volume-filters vehicle-summary-filters"><label className="compact-filter compact-filter-inline"><select className="report-vehicle-filter" aria-label="Lọc công ty tổng hợp xe" value={effectiveCompany} onChange={(event) => setCompany(event.target.value)}><option value="">Tất cả</option>{options.companies.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label className="compact-filter compact-filter-inline"><select className="report-vehicle-filter" aria-label="Lọc biển số xe" value={effectivePlate} onChange={(event) => setPlate(event.target.value)}><option value="">Tất cả</option>{options.plates.map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div> : null}
        <ActionButton kind="image" title={type} onClick={(button) => void exportCardAsImage(button, type)}/><ActionButton kind="csv" title={type} onClick={(button) => exportTableAsCsv(button, type)}/>
      </div>
    </div>
    <div className="table-wrap" tabIndex={0} aria-label={`${LABELS[type]} — cuộn ngang để xem đủ cột`}>
      <table className={`report-data-table report-data-table-${type}`}>
        {type === 'details' ? <colgroup>{prepared.head.map((cell, index) => <col key={index} style={index === 0 ? { width: 156, minWidth: 156 } : explanation(cell) ? { width: 300, minWidth: 300 } : { width: 142, minWidth: 142 }}/>)}</colgroup> : null}
        <thead><tr>{prepared.head.map((cell, index) => <th scope="col" key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(cell) ? ' report-detail-explanation-head' : ''}`.trim()} style={sticky(type, index)}>{String(cell ?? '')}</th>)}</tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map((row, rowIndex) => { const total = isTotalRow(row); const grand = total && rowIndex === visibleRows.length - 1; return <tr key={rowIndex} className={type !== 'details' && total ? `total-row${grand ? ' grand-total-row' : ''}` : undefined} style={{ fontWeight: total ? 800 : 500, fontSize: total ? 13 : 12.5, color: total ? 'var(--deep)' : undefined }}>{prepared.head.map((header, index) => <td key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(header) ? ' report-detail-explanation-cell' : ''}`.trim()} style={cellStyle(type, header, row, index)}>{String(row[index] ?? '')}</td>)}</tr>; }) : <tr><td colSpan={Math.max(1, prepared.head.length)} className="report-c2-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export function ReportModule({ initialBundle, initialError = '' }: { initialBundle: ReportBundle | null; initialError?: string }) {
  const initialMonths = reportMonths(initialBundle?.overview?.months);
  const [bundle, setBundle] = useState(initialBundle);
  const [month, setMonth] = useState(initialMonths.at(-1) || 'Tất cả');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState(initialBundle ? (initialBundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.') : '');
  const months = useMemo(() => reportMonths(bundle?.overview?.months), [bundle]);
  const finance = useMemo(() => filterOverviewMatrix(bundle?.overview?.months, month), [bundle, month]);
  const matrices: Record<ReportType, ReportMatrix | undefined> = { finance, details: bundle?.overview?.details, payroll: bundle?.payroll, vehicles: bundle?.vehicles };
  const visibleTypes: ReportType[] = tab === 'all' ? ['finance', 'details', 'payroll', 'vehicles'] : [tab];

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vtdb:dashboard-meta', { detail: { updatedAt: bundle?.updatedAt, source: bundle?.supabaseCached ? 'supabase' : 'apps-script' } }));
  }, [bundle]);

  const load = async (target: string, forceRefresh = false) => {
    setLoading(true); setError(''); setStatus('Đang tải báo cáo…');
    try {
      const data = await requestReport(target, forceRefresh);
      setBundle(data.bundle);
      const loadedMonths = reportMonths(data.bundle.overview?.months);
      setMonth(target === 'latest' ? loadedMonths.at(-1) || 'Tất cả' : target);
      setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError)); setStatus('');
    } finally { setLoading(false); }
  };

  return <section id="reportsView" className="view active" data-next-report="true">
    <button type="button" data-shell-refresh hidden onClick={() => load(month, true)} aria-hidden="true" tabIndex={-1}/>
    <div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar" role="tablist" aria-label="Loại báo cáo">{TABS.map(([type, label]) => <button type="button" role="tab" aria-selected={tab === type} className={`sub-tab${tab === type ? ' active' : ''}`} data-report-tab={type} onClick={() => setTab(type)} key={type}>{label}</button>)}</div>
    <section className="panel report-filter-panel app-sticky-toolbar sticky-after-tabs">
      <div className="panel-head reports-filter-head"><div className="filter-row reports-filter-row"><input type="search" id="reportSearchInput" aria-label="Tìm trong báo cáo" placeholder="Tìm xe, tài xế..." value={query} onChange={(event) => setQuery(event.target.value)}/><select id="reportMonthFilter" aria-label="Chọn tháng báo cáo" value={month} disabled={loading} onChange={(event) => load(event.target.value)}><option value="Tất cả">Tất cả</option>{months.filter((value) => value !== 'Tất cả').map((value) => <option value={value} key={value}>{value}</option>)}</select></div></div>
    </section>
    <div className="platform-visually-hidden" role="status" aria-live="polite">{error || status}</div>
    {error && !bundle ? <section className="table-card report-c2-error" role="alert"><div className="panel-body"><div className="table-title">Không tải được báo cáo</div><p>{error}</p><button type="button" className="sub-tab" onClick={() => load('latest')} disabled={loading}>Thử lại</button></div></section> : null}
    {loading && !bundle ? <div className="report-stack" aria-busy="true" aria-label="Đang tải báo cáo">{(['finance', 'details', 'payroll', 'vehicles'] as ReportType[]).map((type) => <section className="table-card" key={type}><div className="table-card-head"><div><div className="table-title">{LABELS[type]}</div><div className="panel-note report-month-note">Đang đồng bộ báo cáo từ Google Sheets.</div></div></div><div className="panel-body"><div className="shimmer shimmer-table"/></div></section>)}</div> : null}
    {bundle ? <div className="report-stack" id="reports">{visibleTypes.map((type) => <ReportTable type={type} matrix={matrices[type]} query={query} month={month} key={`${type}-${month}`}/>)}</div> : null}
  </section>;
}

export { matrixRows, formatValueLike };
