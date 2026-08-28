'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ReportBundle, ReportCell, ReportDataResponse, ReportMatrix } from '../../lib/platform/report-types';
import { appendTotal, compareReportMonths, filterOptions, formatReportDisplayValue, formatValueLike, isTotalRow, matchesReportRow, matrixRows, monthsWithinRange, normalizeMonth, parseCellValue, removeAccents, repairCompanyReport, reportDataMonths, reportQuarterMonths, reportSourceRows, stripMonthColumn, transposeOverviewMatrix, type ReportType } from '../../lib/platform/report-c2';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { exportCardAsImage, exportTableAsCsv } from '../../lib/platform/export-card';
import { showToast } from '../../lib/platform/toast';
import { useLatestAsyncRequest } from '../platform/useLatestAsyncRequest';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

const TABS = [
  ['all', 'Tất Cả'],
  ['finance', 'Tổng Quan'],
  ['details', 'Chi Tiết'],
  ['payroll', 'Bảng Lương'],
  ['vehicles', 'Tổng Hợp Xe'],
  ['projects', 'Dự Án']
] as const;

const LABELS: Record<ReportType, string> = {
  finance: 'Báo Cáo Tổng Quan',
  details: 'Báo Cáo Chi Tiết',
  payroll: 'Tổng Hợp Lương',
  vehicles: 'Tổng Hợp Xe',
  projectGroups: 'Tổng Hợp Theo Nhóm',
  projects: 'Chi Tiết Theo Dự Án'
};
const reportResponseCache = new Map<string, ReportDataResponse>();
const reportInflight = new Map<string, Promise<ReportDataResponse>>();
type ReportPeriodMode = 'year' | 'range';
type ReportQuickPeriod = 'current' | 'year' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

function formatMonthControlLabel(month: string) {
  const normalized = normalizeMonth(month);
  const match = normalized.match(/^(\d{2})\/(20\d{2})$/);
  return match ? `${match[1]}/${match[2]}` : normalized;
}

function reportPeriodKey(mode: ReportPeriodMode, fromMonth = '', toMonth = '') {
  return mode === 'year' ? 'year' : `range:${fromMonth}:${toMonth}`;
}

async function requestReport(mode: ReportPeriodMode, fromMonth: string, toMonth: string, forceRefresh: boolean, bypassClientCache = false, signal?: AbortSignal) {
  const key = reportPeriodKey(mode, fromMonth, toMonth);
  if (!forceRefresh && !bypassClientCache && reportResponseCache.has(key)) return reportResponseCache.get(key)!;
  if (!signal && !forceRefresh && !bypassClientCache && reportInflight.has(key)) return reportInflight.get(key)!;
  const url = new URL('/report-data/', window.location.origin);
  if (mode === 'year') {
    url.searchParams.set('month', 'Tất cả');
  } else if (forceRefresh && fromMonth === toMonth) {
    url.searchParams.set('month', fromMonth);
  } else {
    url.searchParams.set('fromMonth', fromMonth);
    url.searchParams.set('toMonth', toMonth);
  }
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const request = (async () => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal, headers: { 'X-VTDB-Client': 'next-report' } });
    const payload = await response.json().catch(() => ({})) as ReportDataResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || `Không tải được báo cáo (${response.status}).`);
    reportResponseCache.set(key, payload);
    return payload;
  })();
  if (!signal && !forceRefresh && !bypassClientCache) reportInflight.set(key, request);
  try { return await request; } finally { if (reportInflight.get(key) === request) reportInflight.delete(key); }
}

function sticky(type: ReportType, index: number): CSSProperties | undefined {
  if (index === 0 && ['finance', 'details', 'payroll', 'vehicles', 'projectGroups', 'projects'].includes(type)) return { left: 0 };
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
    if (category.includes('thuế') || category.includes('chi') || category.includes('dầu') || category.includes('phí')) {
      Object.assign(style, { color: '#dc2626', fontWeight: 600 });
    } else if (category.includes('khối lượng')) {
      Object.assign(style, { color: '#0d9488', fontWeight: 600 });
    } else if (category.includes('doanh thu') || category.includes('lợi nhuận') || category.includes('gộp')) {
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
  } else if (type === 'vehicles' || type === 'projectGroups' || type === 'projects') {
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

function ReportTable({ type, matrix, query, periodLabel }: { type: ReportType; matrix: ReportMatrix | undefined; query: string; periodLabel: string }) {
  const parsed = useMemo(() => matrixRows(matrix), [matrix]);
  const prepared = useMemo(() => stripMonthColumn(type, parsed.head, parsed.body), [parsed, type]);
  const options = useMemo(() => filterOptions(type, prepared.head, prepared.body), [type, prepared]);
  const [company, setCompany] = useState('');
  const [plate, setPlate] = useState('');
  const [job, setJob] = useState('');
  const effectiveCompany = company && options.companies.includes(company) ? company : '';
  const effectivePlate = plate && options.plates.includes(plate) ? plate : '';
  const effectiveJob = job && options.jobs.includes(job) ? job : '';
  const dataRows = useMemo(() => reportSourceRows(type, prepared.body).filter((row) => {
    if (!matchesReportRow(row, query)) return false;
    if (effectiveCompany && String(row[options.companyIdx] ?? '') !== effectiveCompany) return false;
    if (type === 'payroll' && effectiveJob && String(row[options.jobIdx] ?? '') !== effectiveJob) return false;
    return !(type === 'vehicles' && effectivePlate && String(row[options.plateIdx] ?? '') !== effectivePlate);
  }), [prepared.body, type, query, effectiveCompany, effectivePlate, effectiveJob, options]);
  const shouldTotal = type === 'payroll' || type === 'vehicles' || type === 'projectGroups' || type === 'projects';
  const visibleRows = shouldTotal ? appendTotal(prepared.head, dataRows) : dataRows;
  const explanation = (cell: ReportCell) => { const value = String(cell ?? '').toLowerCase(); return value.includes('giải thích') || value.includes('nội dung'); };
  const companyDetail = (cell: ReportCell) => type === 'details' && ['quang quan', 'minh vuong'].some((name) => removeAccents(String(cell ?? '').toLowerCase()).includes(name));

  return <section className="table-card high-density-table" data-report-type={type} aria-labelledby={`report-title-${type}`}>
    <div className="table-card-head report-table-head">
      <div><div className="table-title" id={`report-title-${type}`}>{LABELS[type]} <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({periodLabel})</span></div></div>
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
        <label className="compact-filter">
          <select className="report-payroll-filter platform-content-select" aria-label="Lọc chức vụ bảng lương" value={effectiveJob} onChange={(event) => setJob(event.target.value)}>
            <option value="">Tất cả chức vụ</option>
            {options.jobs.map((value) => <option value={value} key={value}>{value}</option>)}
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
    {(type === 'projectGroups' || type === 'projects') && options.companyIdx >= 0 ? (
      <div className="table-card-subhead">
        <label className="compact-filter">
          <select className="report-project-filter platform-content-select" aria-label={`Lọc công ty ${LABELS[type].toLocaleLowerCase('vi-VN')}`} value={effectiveCompany} onChange={(event) => setCompany(event.target.value)}>
            <option value="">Tất cả công ty</option>
            {options.companies.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
      </div>
    ) : null}
    <div className="table-wrap" tabIndex={0} aria-label={`${LABELS[type]} — cuộn ngang để xem đủ cột`}>
      <table className={`report-data-table report-data-table-${type}`}>
        {type === 'details' ? <colgroup>{prepared.head.map((cell, index) => <col key={index} style={index === 0 ? { width: 190, minWidth: 190 } : explanation(cell) ? { width: 300, minWidth: 300 } : { width: 142, minWidth: 142 }}/>)}</colgroup> : null}
        <thead><tr>{prepared.head.map((cell, index) => <th scope="col" key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(cell) ? ' report-detail-explanation-head' : ''}${type === 'finance' && index === prepared.head.length - 1 ? ' report-period-total' : ''}`.trim()} style={sticky(type, index)}>{String(cell ?? '')}</th>)}</tr></thead>
        <tbody>{visibleRows.length ? visibleRows.map((row, rowIndex) => { const total = isTotalRow(row); const grand = total && rowIndex === visibleRows.length - 1; return <tr key={rowIndex} className={type !== 'details' && type !== 'finance' && total ? `total-row${grand ? ' grand-total-row' : ''}` : undefined} style={{ fontWeight: total ? 800 : 500, fontSize: total ? 13 : 12.5, color: total ? 'var(--deep)' : undefined }}>{prepared.head.map((header, index) => <td key={index} className={`${sticky(type, index) ? 'sticky-col' : ''}${type === 'details' && explanation(header) ? ' report-detail-explanation-cell' : ''}${companyDetail(header) ? ' report-detail-company-cell' : ''}${type === 'finance' && index === prepared.head.length - 1 ? ' report-period-total' : ''}${index > 0 ? ' tabular-nums' : ''}`.trim()} style={cellStyle(type, header, row, index)}>{formatReportDisplayValue(type, header, row, index)}</td>)}</tr>; }) : <tr><td colSpan={Math.max(1, prepared.head.length)} className="report-c2-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export function ReportModule({ initialBundle, initialVehicleOwners = {}, initialError = '' }: { initialBundle: ReportBundle | null; initialVehicleOwners?: Record<string, string>; initialError?: string }) {
  const initialMonths = reportDataMonths(initialBundle?.overview?.months);
  const initialCurrentMonth = normalizeMonth(initialMonths.at(-1) || '');
  const [bundle, setBundle] = useState(initialBundle);
  const [vehicleOwners, setVehicleOwners] = useState(initialVehicleOwners);
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('range');
  const [quickPeriod, setQuickPeriod] = useState<ReportQuickPeriod>('current');
  const [fromMonth, setFromMonth] = useState(initialCurrentMonth);
  const [toMonth, setToMonth] = useState(initialCurrentMonth);
  const [renderedPeriod, setRenderedPeriod] = useState<string | null>(initialBundle ? reportPeriodKey('range', initialCurrentMonth, initialCurrentMonth) : null);
  const [availableMonths, setAvailableMonths] = useState(initialMonths);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState(initialBundle ? (initialBundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.') : '');
  const latestRequest = useLatestAsyncRequest();
  const visiblePeriodRef = useRef({ mode: periodMode, fromMonth, toMonth });
  useEffect(() => { visiblePeriodRef.current = { mode: periodMode, fromMonth, toMonth }; }, [periodMode, fromMonth, toMonth]);
  const periodKey = reportPeriodKey(periodMode, fromMonth, toMonth);
  const financeMonths = useMemo(() => periodMode === 'year' ? availableMonths : monthsWithinRange(availableMonths, fromMonth, toMonth), [periodMode, availableMonths, fromMonth, toMonth]);
  const finance = useMemo(() => transposeOverviewMatrix(bundle?.overview?.months, financeMonths, 'Tổng'), [bundle, financeMonths]);
  const repairedCompanyReport = useMemo(() => repairCompanyReport(bundle?.overview?.details, bundle?.vehicles, vehicleOwners), [bundle, vehicleOwners]);
  const matrices: Record<ReportType, ReportMatrix | undefined> = { finance, details: repairedCompanyReport.details, payroll: bundle?.payroll, vehicles: repairedCompanyReport.vehicles, projectGroups: bundle?.projectGroups, projects: bundle?.projects };
  const visibleTypes: ReportType[] = tab === 'all'
    ? ['finance', 'details', 'payroll', 'vehicles', 'projectGroups', 'projects']
    : tab === 'projects'
      ? ['projectGroups', 'projects']
      : [tab];
  const reportYear = financeMonths.at(-1)?.slice(-4) || toMonth.slice(-4);
  const periodLabel = periodMode === 'year' ? `Năm ${reportYear}` : fromMonth === toMonth ? fromMonth : `${fromMonth} – ${toMonth}`;
  const hasCurrentBundle = Boolean(bundle && renderedPeriod === periodKey);

  useEffect(() => {
    if (!initialBundle) return;
    reportResponseCache.set(reportPeriodKey('range', initialCurrentMonth, initialCurrentMonth), { bundle: initialBundle, vehicleOwners: initialVehicleOwners, requestedMonth: initialCurrentMonth });
  }, [initialBundle, initialVehicleOwners, initialCurrentMonth]);

  useEffect(() => {
    publishDataSourceMeta(bundle);
  }, [bundle]);

  const loadPeriod = async (targetMode: ReportPeriodMode, targetFrom = fromMonth, targetTo = toMonth, forceRefresh = false, announce = false) => {
    const normalizedFrom = normalizeMonth(targetFrom);
    const normalizedTo = normalizeMonth(targetTo);
    const targetKey = reportPeriodKey(targetMode, normalizedFrom, normalizedTo);
    setPeriodMode(targetMode);
    if (normalizedFrom) setFromMonth(normalizedFrom);
    if (normalizedTo) setToMonth(normalizedTo);
    const requestState = latestRequest.begin();
    const cached = !forceRefresh && !announce ? reportResponseCache.get(targetKey) : undefined;
    if (cached) {
      setBundle(cached.bundle);
      setVehicleOwners(cached.vehicleOwners || {});
      setAvailableMonths(reportDataMonths(cached.bundle.overview?.months));
      setRenderedPeriod(targetKey);
      setError('');
      setStatus(cached.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
      setLoading(false);
      return;
    }
    if (targetKey !== renderedPeriod) {
      setBundle(null);
      setRenderedPeriod(null);
    }
    setLoading(true); setError(''); setStatus('Đang tải báo cáo từ Supabase…');
    if (forceRefresh || announce) showToast(forceRefresh ? 'Đang đối soát Báo cáo từ Google Sheet…' : 'Đang tải Báo cáo từ Supabase…', 'loading');
    try {
      const data = await requestReport(targetMode, normalizedFrom, normalizedTo, forceRefresh, announce, requestState.signal);
      if (!requestState.isCurrent()) return;
      setBundle(data.bundle);
      setVehicleOwners(data.vehicleOwners || {});
      const loadedMonths = reportDataMonths(data.bundle.overview?.months);
      setAvailableMonths(loadedMonths);
      if (targetMode === 'year' && loadedMonths.length) {
        setFromMonth(normalizeMonth(loadedMonths[0]));
        setToMonth(normalizeMonth(loadedMonths.at(-1)));
      }
      setRenderedPeriod(targetKey);
      setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
      if (forceRefresh || announce) showToast('Dữ liệu Báo cáo đã được cập nhật.', 'success');
    } catch (loadError) {
      if (!requestState.isCurrent() || (loadError instanceof DOMException && loadError.name === 'AbortError')) return;
      const message = loadError instanceof Error ? loadError.message : String(loadError); setError(message); setStatus(''); showToast(message, 'error');
    } finally { if (requestState.isCurrent()) setLoading(false); }
  };

  useVisibleRevalidation(async () => {
    if (loading) return;
    const target = visiblePeriodRef.current;
    const targetKey = reportPeriodKey(target.mode, target.fromMonth, target.toMonth);
    const data = await requestReport(target.mode, target.fromMonth, target.toMonth, false, true);
    if (reportPeriodKey(visiblePeriodRef.current.mode, visiblePeriodRef.current.fromMonth, visiblePeriodRef.current.toMonth) !== targetKey) return;
    setBundle(data.bundle);
    setVehicleOwners(data.vehicleOwners || {});
    setAvailableMonths(reportDataMonths(data.bundle.overview?.months));
    setRenderedPeriod(targetKey);
    setError('');
    setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
  }, !loading);

  const selectFromMonth = (value: string) => {
    const nextFrom = normalizeMonth(value);
    const nextTo = compareReportMonths(nextFrom, toMonth) > 0 ? nextFrom : toMonth;
    setQuickPeriod('custom');
    void loadPeriod('range', nextFrom, nextTo);
  };

  const selectToMonth = (value: string) => {
    const nextTo = normalizeMonth(value);
    const nextFrom = compareReportMonths(fromMonth, nextTo) > 0 ? nextTo : fromMonth;
    setQuickPeriod('custom');
    void loadPeriod('range', nextFrom, nextTo);
  };

  const selectQuickPeriod = (value: ReportQuickPeriod) => {
    setQuickPeriod(value);
    if (value === 'custom') return;
    if (value === 'current') {
      const currentMonth = normalizeMonth(availableMonths.at(-1) || '');
      if (currentMonth) void loadPeriod('range', currentMonth, currentMonth);
      return;
    }
    if (value === 'year') {
      void loadPeriod('year');
      return;
    }
    const months = reportQuarterMonths(availableMonths, Number(value.slice(1)));
    if (!months.length) return;
    void loadPeriod('range', months[0], months.at(-1)!);
  };

  return <section id="reportsView" className="view active" data-next-report="true">
    <button type="button" data-shell-refresh hidden onClick={() => loadPeriod(periodMode, fromMonth, toMonth, false, true)} aria-hidden="true" tabIndex={-1}/>
    <div className="sub-tabs-bar app-sticky-tabs" id="reportTabsBar" role="tablist" aria-label="Loại báo cáo">{TABS.map(([type, label]) => <button type="button" role="tab" aria-selected={tab === type} className={`sub-tab${tab === type ? ' active' : ''}`} data-report-tab={type} onClick={() => setTab(type)} key={type}>{label}</button>)}</div>
    <section className="panel report-filter-panel cashflow-overview-filter-panel app-sticky-toolbar sticky-after-tabs" aria-label="Bộ lọc thời gian Báo cáo">
      <div className="report-filter-stack">
        <div className="report-filter-row-top">
          <div className="report-month-range">
            <label className="custom-date-box report-month-input">
              <span className="date-display-text">{formatMonthControlLabel(fromMonth)}</span>
              <select id="reportMonthFromFilter" aria-label="Từ tháng" aria-busy={loading || undefined} value={fromMonth} onChange={(event) => selectFromMonth(event.target.value)}>{availableMonths.map((value) => <option value={normalizeMonth(value)} key={value}>{formatMonthControlLabel(value)}</option>)}</select>
            </label>
            <span className="date-range-separator" aria-hidden="true">→</span>
            <label className="custom-date-box report-month-input">
              <span className="date-display-text">{formatMonthControlLabel(toMonth)}</span>
              <select id="reportMonthToFilter" aria-label="Đến tháng" aria-busy={loading || undefined} value={toMonth} onChange={(event) => selectToMonth(event.target.value)}>{availableMonths.map((value) => <option value={normalizeMonth(value)} key={value}>{formatMonthControlLabel(value)}</option>)}</select>
            </label>
          </div>
          <select id="reportQuickPeriodFilter" aria-label="Bộ lọc nhanh thời gian Báo cáo" className="report-quick-period-select cashflow-quick-period-select platform-content-select" value={quickPeriod} onChange={(event) => selectQuickPeriod(event.target.value as ReportQuickPeriod)}>
            <option value="current">Tháng này</option>
            <option value="year">Năm nay</option>
            {[1, 2, 3, 4].map((quarter) => <option value={`q${quarter}`} disabled={!reportQuarterMonths(availableMonths, quarter).length} key={quarter}>Quý {quarter}</option>)}
            <option value="custom">Tùy chọn</option>
          </select>
        </div>
        <div className="report-filter-row-search">
          <input type="search" id="reportSearchInput" aria-label="Tìm trong báo cáo" placeholder="Tìm nhiều giá trị, ngăn cách bằng dấu phẩy..." value={query} onChange={(event) => setQuery(event.target.value)}/>
        </div>
      </div>
    </section>
    <div className="platform-visually-hidden" role="status" aria-live="polite">{error || status}</div>
    {error && !hasCurrentBundle ? <section className="table-card report-c2-error" role="alert"><div className="panel-body"><div className="table-title">Không tải được báo cáo</div><p>{error}</p><button type="button" className="sub-tab" onClick={() => loadPeriod(periodMode, fromMonth, toMonth)} disabled={loading}>Thử lại</button></div></section> : null}
    {loading && !hasCurrentBundle ? <div className="report-stack report-stack-loading" aria-busy="true" aria-label="Đang tải báo cáo">{visibleTypes.map((type) => <section className="table-card" key={type}><div className="table-card-head"><div><div className="table-title">{LABELS[type]}</div></div></div><div className="panel-body"><div className="shimmer shimmer-table"/></div></section>)}</div> : null}
    {hasCurrentBundle ? <div className="report-stack report-stack-enter" id="reports" key={periodKey} aria-busy={loading || undefined}>{visibleTypes.map((type) => <ReportTable type={type} matrix={matrices[type]} query={query} periodLabel={periodLabel} key={`${type}-${periodKey}`}/>)}</div> : null}
  </section>;
}

export { matrixRows, formatValueLike };
