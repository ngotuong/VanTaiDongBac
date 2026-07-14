'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardBundle, DashboardDataResponse, DashboardTrip } from '../../lib/platform/dashboard-types';
import { buildKpiMap, formatCurrencyText, growth, metricValue, parseDashboardRows, type DashboardMetricKey, type DashboardMonthRow } from '../../lib/platform/dashboard-c2';

type MetricSpec = { key: DashboardMetricKey; label: string; badge: 'blue' | 'red' | 'amber' | 'green'; invert?: boolean; icon: React.ReactNode };

const METRICS: MetricSpec[] = [
  { key: 'revenue', label: 'Tổng doanh thu', badge: 'blue', icon: <svg className="btn-svg" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  { key: 'operatingCost', label: 'Chi phí vận hành', badge: 'red', invert: true, icon: <svg className="btn-svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
  { key: 'gross', label: 'Lợi nhuận gộp', badge: 'amber', icon: <svg className="btn-svg" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { key: 'cashCost', label: 'Chi phí sau vận hành', badge: 'red', invert: true, icon: <svg className="btn-svg" viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M7 10h.01M17 14h.01M12 12a2 2 0 1 0 0 .01"/></svg> },
  { key: 'final', label: 'Lợi nhuận thực tế', badge: 'green', icon: <svg className="btn-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
];

async function requestDashboard(): Promise<DashboardDataResponse> {
  const url = new URL('/dashboard-data/', window.location.origin);
  url.searchParams.set('forceRefresh', 'true');
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function sourceOf(dashboard: DashboardBundle | null): 'supabase' | 'apps-script' | undefined {
  if (!dashboard) return undefined;
  return dashboard.supabaseCached ? 'supabase' : 'apps-script';
}

function MetricCard({ spec, row, previous, kpiMap, time }: { spec: MetricSpec; row: DashboardMonthRow; previous?: DashboardMonthRow; kpiMap: ReturnType<typeof buildKpiMap>; time: string }) {
  const value = metricValue(row, spec.key, kpiMap);
  const previousValue = previous ? metricValue(previous, spec.key, kpiMap) : undefined;
  const comparison = growth(value, previousValue, spec.invert);
  const badge = spec.key === 'final' ? (value >= 0 ? 'green' : 'red') : spec.badge;
  return <article className="kpi-card">
    <div className="kpi-card-header"><div className="kpi-label">{spec.label}</div><div className={`kpi-icon-badge ${badge}`}>{spec.icon}</div></div>
    <div className={`kpi-value ${badge}`}>{formatCurrencyText(value)} <span className="unit"/></div>
    <div className="kpi-card-footer"><div className={`kpi-status ${comparison.statusClass}`}><span>{comparison.text}</span></div><div className="kpi-time">{time}</div></div>
  </article>;
}

function ProfitChart({ rows }: { rows: DashboardMonthRow[] }) {
  const data = rows.filter((row) => row.month).slice(-12);
  if (!data.length) return <div className="panel-note">Chưa có dữ liệu báo cáo lợi nhuận.</div>;
  const step = 500_000_000;
  const maxValue = Math.max(...data.map((row) => Math.abs(row.final)), 1);
  const max = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let value = max; value >= 0; value -= step) ticks.push(value);
  const short = (value: number) => Math.abs(value) >= 1e9 ? `${(value / 1e9).toFixed(1).replace('.', ',').replace(',0', '')} tỷ` : Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(0)} tr` : String(value);
  return <div className="chart-wrapper" style={{ display: 'flex', alignItems: 'flex-end', position: 'relative', marginTop: 10 }}>
    <div className="chart-y-axis" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 130, paddingRight: 12, textAlign: 'right', width: 60, color: 'var(--muted)', fontSize: 10, fontWeight: 600, marginBottom: 23, flexShrink: 0, borderRight: '1px solid var(--line)' }}>{ticks.map((value) => <div key={value}>{short(value)}</div>)}</div>
    <div className="chart-area" style={{ flex: 1, position: 'relative', overflowX: 'auto' }}>
      <div className="chart-grid-lines" style={{ position: 'absolute', left: 0, right: 0, height: 130, bottom: 23, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 1 }}>{ticks.map((value) => <div key={value} style={{ borderBottom: value === 0 ? '2px solid var(--muted)' : '1px dashed var(--line)', width: '100%' }}/>)}</div>
      <div className="chart-v" style={{ position: 'relative', zIndex: 2, background: 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 190, width: '100%', gap: 8 }}>
        {data.map((row) => { const percent = Math.max(2, Math.round(Math.abs(row.final) / max * 100)); return <div className="chart-col" key={row.month}>
          <div className="bar-value">{row.final < 0 ? '-' : ''}{formatCurrencyText(Math.abs(row.final))}</div>
          <div className="bar-track-v"><div className="bar-fill-v" style={{ height: `${percent}%`, background: row.final < 0 ? 'linear-gradient(180deg, #f87171, var(--red))' : 'linear-gradient(180deg, var(--teal), var(--deep-2))', width: '100%' }}/></div>
          <div className="bar-label">{row.month}</div>
        </div>; })}
      </div>
    </div>
  </div>;
}

type Html2Canvas = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
let html2CanvasLoader: Promise<Html2Canvas> | null = null;
function loadHtml2Canvas() {
  const current = (window as Window & { html2canvas?: Html2Canvas }).html2canvas;
  if (current) return Promise.resolve(current);
  if (html2CanvasLoader) return html2CanvasLoader;
  html2CanvasLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { html2canvas?: Html2Canvas }).html2canvas;
      if (loaded) resolve(loaded);
      else reject(new Error('Không thể tải thư viện xuất ảnh.'));
    };
    script.onerror = () => reject(new Error('Không thể tải thư viện xuất ảnh.'));
    document.head.appendChild(script);
  });
  return html2CanvasLoader;
}

async function exportCardAsImage(button: HTMLButtonElement, title: string) {
  const card = button.closest<HTMLElement>('.table-card');
  if (!card) return;
  button.disabled = true;
  card.classList.add('is-exporting');
  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(card, { backgroundColor: '#ffffff', scale: Math.min(window.devicePixelRatio || 1, 2), useCORS: true });
    const link = document.createElement('a');
    link.download = `${title}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Không thể xuất ảnh.');
  } finally {
    card.classList.remove('is-exporting');
    button.disabled = false;
  }
}

function ExportButton({ title }: { title: string }) {
  return <button type="button" className="sub-tab dashboard-export-button" title="Xuất ảnh" aria-label={`Xuất ảnh ${title}`} onClick={(event) => void exportCardAsImage(event.currentTarget, title)}><svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>;
}

export function DashboardModule({ initialDashboard, initialError = '' }: { initialDashboard: DashboardBundle | null; initialError?: string }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const rows = useMemo(() => parseDashboardRows(dashboard?.overview?.months), [dashboard]);
  const kpiMap = useMemo(() => buildKpiMap(dashboard?.overview?.kpis), [dashboard]);
  const effectiveMonth = selectedMonth && rows.some((row) => row.month === selectedMonth) ? selectedMonth : rows[rows.length - 1]?.month || '';
  const selectedIndex = rows.findIndex((row) => row.month === effectiveMonth);
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
  const previous = selectedIndex > 0 ? rows[selectedIndex - 1] : undefined;
  const trips = dashboard?.latestTrips?.trips || [];
  const time = dashboard?.updatedAt?.split(' ')[1] || '';

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vtdb:dashboard-meta', { detail: { updatedAt: dashboard?.updatedAt, source: sourceOf(dashboard) } }));
  }, [dashboard]);

  const refresh = async () => {
    setLoading(true); setError('');
    try { const data = await requestDashboard(); setDashboard(data.dashboard); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)); }
    finally { setLoading(false); }
  };

  return <section className="view active" data-next-dashboard="true" aria-label="Tổng quan kết quả kinh doanh">
    <button type="button" data-shell-refresh hidden onClick={refresh} aria-hidden="true" tabIndex={-1}/>
    <span className="platform-visually-hidden" role="status" aria-live="polite">{loading ? 'Đang cập nhật dữ liệu.' : error}</span>
    {error ? <div className="panel" role="alert" style={{ padding: 16, marginBottom: 20 }}>{error}{!dashboard ? <button type="button" onClick={refresh} disabled={loading}>Thử lại</button> : null}</div> : null}
    <div className="panel dashboard-month-panel">
      <div className="dashboard-month-title"><svg className="btn-svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{effectiveMonth}</div>
      <select aria-label="Chọn tháng tổng quan" value={effectiveMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{rows.map((row) => <option value={row.month} key={row.month}>{row.month}</option>)}</select>
    </div>
    {selected ? <div className="kpi-grid">{METRICS.map((spec) => <MetricCard key={spec.key} spec={spec} row={selected} previous={previous} kpiMap={kpiMap} time={time}/>)}</div> : <div className="kpi-grid" aria-busy="true">{METRICS.map((spec) => <article className="kpi-card" key={spec.key}><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>)}</div>}
    <section className="panel" style={{ marginBottom: 24 }}><div className="panel-head"><div><h2 className="panel-title">Biểu đồ lợi nhuận thực tế</h2><div className="panel-note"/></div></div><div className="panel-body"><div className="chart"><ProfitChart rows={rows}/></div></div></section>
    <section className="panel table-card" style={{ marginBottom: 24 }}><div className="table-card-head"><div><div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>Dữ liệu chuyến gần đây <span style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 14 }}>{dashboard?.latestTrips?.date ? `(${dashboard.latestTrips.date})` : ''}</span></div></div><div className="dashboard-export-actions"><ExportButton title="Số chuyến xe"/></div></div>
      <div className="table-wrap"><table><thead><tr><th style={{ width: '28%' }}>Dự án</th><th style={{ width: '26%' }}>Biển số xe</th><th style={{ width: '20%' }}>Số chuyến chạy</th><th style={{ width: '26%' }}>Số phiếu</th></tr></thead><tbody>{trips.length ? <>{trips.map((trip: DashboardTrip, index) => <tr key={`${trip.project}-${trip.vehicle}-${index}`}><td style={{ fontWeight: 600 }}>{trip.project || '-'}</td><td style={{ fontWeight: 700, color: 'var(--deep)' }}>{trip.vehicle || ''}</td><td style={{ fontWeight: 600 }}>{Number(trip.count || 0).toLocaleString('vi-VN')}</td><td style={{ color: 'var(--muted)' }}>{trip.ticket || '-'}</td></tr>)}<tr className="total-row"><td colSpan={2} style={{ fontWeight: 800, color: 'var(--deep)' }}>Tổng cộng</td><td style={{ fontWeight: 800, color: 'var(--teal)' }}>{trips.reduce((sum, trip) => sum + Number(trip.count || 0), 0).toLocaleString('vi-VN')}</td><td/></tr></> : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Chưa có dữ liệu chuyến xe của ngày mới nhất.</td></tr>}</tbody></table></div>
    </section>
    <section className="panel table-card" style={{ marginBottom: 24 }}><div className="table-card-head"><div className="table-title">Kết quả kinh doanh theo tháng</div><div className="dashboard-export-actions"><ExportButton title="Tổng quan"/></div></div><div className="table-wrap"><table><thead><tr>{['Tháng','Tổng khối lượng','Tổng doanh thu','Thuế TNDN','Thuế VAT','Dầu Quang Minh','Dầu đổ ngoài','Phí đường bộ','Lợi nhuận gộp','Chi quỹ thực tế','Lợi nhuận thực'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.month}>{Array.from({ length: 11 }, (_, index) => <td key={index} style={index === 0 ? { fontWeight: 700, color: 'var(--deep)' } : [2,8,10].includes(index) ? { color: 'var(--green)', fontWeight: 600 } : [3,4,5,6,7,9].includes(index) ? { color: 'var(--red)' } : undefined}>{index === 8 ? formatCurrencyText(row.gross) : String(row.raw[index] ?? '')}</td>)}</tr>) : <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Chưa có dữ liệu báo cáo tài chính.</td></tr>}</tbody></table></div></section>
  </section>;
}
