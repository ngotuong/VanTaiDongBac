'use client';

import { useMemo, useRef, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import type { ReportBundle, ReportDataResponse, ReportMatrix } from '../../lib/platform/report-types';
import { exportCardAsImage, ImageExportIcon } from '../../lib/platform/export-card';

const TABS = [
  ['all', 'Tất Cả'],
  ['finance', 'Tổng Quan'],
  ['details', 'Chi Tiết'],
  ['payroll', 'Bảng Lương'],
  ['vehicles', 'Tổng Hợp Xe']
] as const;
type ReportType = Exclude<(typeof TABS)[number][0], 'all'>;
const LABELS: Record<ReportType, string> = {
  finance: 'Báo cáo tổng quan',
  details: 'Báo cáo chi tiết',
  payroll: 'Tổng hợp lương',
  vehicles: 'Tổng hợp xe'
};

export function matrixRows(matrix: ReportMatrix | undefined) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
  return headerIndex < 0
    ? { head: [], body: [] }
    : { head: rows[headerIndex], body: rows.slice(headerIndex + 1).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())) };
}

function reportMonths(bundle: ReportBundle | null) {
  const { body } = matrixRows(bundle?.overview?.months);
  return [...new Set(body.map((row) => String(row?.[0] || '').trim()).filter(Boolean))];
}

async function requestReport(month: string, forceRefresh: boolean) {
  const url = new URL('/report-data/', window.location.origin);
  url.searchParams.set('month', month);
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-VTDB-Client': 'next-report' } });
  const payload = await response.json().catch(() => ({})) as ReportDataResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Không tải được báo cáo (${response.status}).`);
  return payload;
}

function ReportTable({ type, matrix, query }: { type: ReportType; matrix: ReportMatrix | undefined; query: string }) {
  const card = useRef<HTMLElement>(null);
  const { head, body } = matrixRows(matrix);
  const normalized = query.trim().toLocaleLowerCase('vi-VN');
  const visible = normalized ? body.filter((row) => row.join(' ').toLocaleLowerCase('vi-VN').includes(normalized)) : body;
  const exportImage = () => void exportCardAsImage(card.current, type).catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
  return <section className="table-card report-module-card" ref={card} aria-labelledby={`report-title-${type}`}>
    <div className="table-card-head report-module-card-head">
      <div><h2 id={`report-title-${type}`}>{LABELS[type]}</h2><p>{visible.length} dòng hiển thị</p></div>
      <button type="button" className="c2-image-export" title="Xuất ảnh" aria-label={`Xuất ảnh ${LABELS[type]}`} onClick={exportImage} disabled={!head.length}><ImageExportIcon /></button>
    </div>
    <div className="table-wrap report-module-table-wrap" tabIndex={0} aria-label={`${LABELS[type]} — cuộn ngang để xem đủ cột`}>
      <table><thead><tr>{head.map((cell, index) => <th scope="col" key={index}>{String(cell ?? '')}</th>)}</tr></thead>
        <tbody>{visible.length ? visible.map((row, rowIndex) => <tr key={rowIndex}>{head.map((_, index) => <td key={index}>{String(row?.[index] ?? '')}</td>)}</tr>) : <tr><td colSpan={Math.max(1, head.length)} className="report-module-empty">Không có dữ liệu phù hợp với bộ lọc.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export function ReportModule({ initialBundle, initialError = '' }: { initialBundle: ReportBundle | null; initialError?: string }) {
  const context = useWorkbookContext();
  const [bundle, setBundle] = useState(initialBundle);
  const [month, setMonth] = useState('latest');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [status, setStatus] = useState(initialBundle ? (initialBundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.') : '');
  const months = useMemo(() => reportMonths(bundle), [bundle]);
  const matrices: Record<ReportType, ReportMatrix | undefined> = {
    finance: bundle?.overview?.months,
    details: bundle?.overview?.details,
    payroll: bundle?.payroll,
    vehicles: bundle?.vehicles
  };
  const visibleTypes: ReportType[] = tab === 'all' ? ['finance', 'details', 'payroll', 'vehicles'] : [tab];

  const load = async (target: string, forceRefresh = false) => {
    setLoading(true); setError(''); setStatus('Đang tải báo cáo…');
    try {
      const data = await requestReport(target, forceRefresh);
      setBundle(data.bundle); setMonth(target);
      setStatus(data.bundle.apiCached ? 'Dữ liệu từ API cache.' : 'Dữ liệu từ API.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError)); setStatus('');
    } finally { setLoading(false); }
  };

  return <section className="report-module" data-next-report="true" aria-labelledby="report-page-title">
    <header className="react-module-heading report-module-header">
      <div><p className="platform-eyebrow">VẬN TẢI · {context.workbook.year}</p><h1 id="report-page-title">Báo cáo</h1><p className="report-module-status" role="status" aria-live="polite">{error || status}</p></div>
      <button type="button" className="report-module-secondary" data-shell-refresh onClick={() => load(month, true)} disabled={loading}>{loading ? 'Đang tải…' : 'Làm mới'}</button>
    </header>

    <div className="sub-tabs-bar app-sticky-tabs report-module-tabs" role="tablist" aria-label="Loại báo cáo">
      {TABS.map(([type, label]) => <button type="button" role="tab" aria-selected={tab === type} className={`sub-tab${tab === type ? ' active' : ''}`} onClick={() => setTab(type)} key={type}>{label}</button>)}
    </div>

    <div className="panel report-filter-panel app-sticky-toolbar sticky-after-tabs report-module-filters">
      <label><span>Tìm trong báo cáo</span><input type="search" value={query} placeholder="Tìm xe, tài xế…" onChange={(event) => setQuery(event.target.value)} /></label>
      <label><span>Kỳ báo cáo</span><select value={month} disabled={loading} onChange={(event) => load(event.target.value)}><option value="latest">Tháng gần nhất</option><option value="Tất cả">Tất cả</option>{months.filter((item) => item !== 'Tất cả').map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
    </div>

    {error && !bundle ? <div className="report-module-error" role="alert"><h2>Không tải được báo cáo</h2><p>{error}</p><button type="button" onClick={() => load(month)} disabled={loading}>Thử lại</button></div> : null}
    {loading && !bundle ? <div className="report-module-skeleton" aria-busy="true" aria-label="Đang tải báo cáo"><span /><span /><span /></div> : null}
    {bundle ? <div className="report-stack report-module-stack">{visibleTypes.map((type) => <ReportTable type={type} matrix={matrices[type]} query={query} key={type} />)}</div> : null}
  </section>;
}
