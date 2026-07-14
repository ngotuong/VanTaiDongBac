'use client';

import { useMemo, useRef, useState } from 'react';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import type { DashboardBundle, DashboardDataResponse, DashboardTrip } from '../../lib/platform/dashboard-types';
import type { ReportCell, ReportMatrix } from '../../lib/platform/report-types';
import { exportCardAsImage, ImageExportIcon } from '../../lib/platform/export-card';

type MonthRow = { month: string; revenue: number; operatingCost: number; gross: number; cashCost: number; final: number; raw: ReportCell[] };

function numberValue(value: unknown) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
  if (!text) return 0;
  if (text.includes('.') && text.includes(',')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if ((text.match(/[.,]/g) || []).length > 1 || /[.,]\d{3}$/.test(text)) text = text.replace(/[.,]/g, '');
  else text = text.replace(',', '.');
  return Number(text) || 0;
}

function parseRows(matrix?: ReportMatrix): MonthRow[] {
  const rows = matrix || [];
  const headerIndex = rows.findIndex((row) => String(row?.[0] ?? '').trim().toLowerCase() === 'tháng');
  return rows.slice(headerIndex >= 0 ? headerIndex + 1 : 2).map((raw) => {
    const revenue = numberValue(raw?.[2]);
    const gross = numberValue(raw?.[8]) || revenue - numberValue(raw?.[3]) - numberValue(raw?.[4]) - numberValue(raw?.[5]) - numberValue(raw?.[7]);
    const final = numberValue(raw?.[10]);
    return { month: String(raw?.[0] ?? '').trim(), revenue, operatingCost: revenue - gross, gross, cashCost: gross - final, final, raw };
  }).filter((row) => row.month && row.month !== 'Tháng');
}

const currency = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
function shortMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (abs >= 1e6) return `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} tr`;
  return value.toLocaleString('vi-VN');
}
const totalTrips = (trips: DashboardTrip[]) => trips.reduce((sum, trip) => sum + Number(trip.count || 0), 0);

async function requestDashboard(): Promise<DashboardDataResponse> {
  const url = new URL('/dashboard-data/', window.location.origin);
  url.searchParams.set('forceRefresh', 'true');
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export function DashboardModule({ initialDashboard, initialError = '' }: { initialDashboard: DashboardBundle | null; initialError?: string }) {
  const context = useWorkbookContext();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedMonth, setSelectedMonth] = useState('latest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const latestTripsCard = useRef<HTMLElement>(null);
  const summaryCard = useRef<HTMLElement>(null);
  const rows = useMemo(() => parseRows(dashboard?.overview?.months), [dashboard]);
  const selected = selectedMonth === 'latest' ? rows.at(-1) : rows.find((row) => row.month === selectedMonth);
  const trips = dashboard?.latestTrips?.trips || [];
  const maxProfit = Math.max(...rows.slice(-12).map((row) => Math.abs(row.final)), 1);
  const source = dashboard?.supabaseCached ? 'Supabase cache' : 'Apps Script';
  const metrics = selected ? [
    ['Tổng doanh thu', selected.revenue, 'blue'], ['Chi phí vận hành', selected.operatingCost, 'red'], ['Lợi nhuận gộp', selected.gross, 'amber'],
    ['Chi phí sau vận hành', selected.cashCost, 'red'], ['Lợi nhuận thực tế', selected.final, 'green']
  ] as const : [];

  const refresh = async () => {
    setLoading(true); setError('');
    try { const data = await requestDashboard(); setDashboard(data.dashboard); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)); }
    finally { setLoading(false); }
  };

  const exportImage = async (card: HTMLElement | null, name: string) => {
    setError('');
    try { await exportCardAsImage(card, name); }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : String(exportError)); }
  };

  return <section className="dashboard-module" data-next-dashboard="true" aria-labelledby="dashboard-page-title">
    <header className="dashboard-module-header">
      <div><p className="platform-eyebrow">VẬN TẢI · {context.workbook.year}</p><h1 id="dashboard-page-title">Tổng quan</h1><p className="dashboard-module-status" role="status" aria-live="polite">{error || (dashboard ? `Nguồn: ${source}${dashboard.updatedAt ? ` · cập nhật ${dashboard.updatedAt}` : ''}` : '')}</p></div>
      <button type="button" className="dashboard-module-button" data-shell-refresh onClick={refresh} disabled={loading}>{loading ? 'Đang tải…' : 'Làm mới'}</button>
    </header>
    {error && !dashboard ? <div className="dashboard-module-error" role="alert"><h2>Không tải được tổng quan</h2><p>{error}</p><button type="button" onClick={refresh} disabled={loading}>Thử lại</button></div> : null}
    {loading && !dashboard ? <div className="dashboard-module-skeleton" aria-busy="true" aria-label="Đang tải tổng quan"><span /><span /><span /></div> : null}
    {dashboard ? <>
      <div className="dashboard-module-filter"><strong>Tháng</strong><label><span className="platform-visually-hidden">Kỳ hiển thị</span><select aria-label="Kỳ hiển thị" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="latest">Tháng gần nhất</option>{rows.map((row) => <option value={row.month} key={row.month}>{row.month}</option>)}</select></label></div>
      {selected ? <div className="dashboard-module-kpis">{metrics.map(([label, value, tone]) => <article className={`dashboard-kpi-${tone}`} key={label}><header><span>{label}</span><i aria-hidden="true" /></header><strong>{currency(value)}</strong><small>{selected.month}</small></article>)}</div> : <div className="dashboard-module-empty">Chưa có dữ liệu KPI.</div>}
      <section className="dashboard-module-card" aria-labelledby="profit-chart-title"><div className="dashboard-module-card-head"><div><h2 id="profit-chart-title">Lợi nhuận thực tế</h2><p>12 kỳ gần nhất</p></div></div>
        {rows.length ? <div className="dashboard-profit-chart" role="img" aria-label="Biểu đồ lợi nhuận thực tế theo tháng">{rows.slice(-12).map((row) => <div className="dashboard-profit-column" key={row.month}><strong>{shortMoney(row.final)}</strong><span className={row.final < 0 ? 'negative' : ''} style={{ height: `${Math.max(4, Math.abs(row.final) / maxProfit * 132)}px` }} title={`${row.month}: ${currency(row.final)}`} /><small>{row.month}</small></div>)}</div> : <div className="dashboard-module-empty">Chưa có dữ liệu lợi nhuận.</div>}
      </section>
      <section className="dashboard-module-card" ref={latestTripsCard} aria-labelledby="latest-trips-title"><div className="dashboard-module-card-head"><div><h2 id="latest-trips-title">Dữ liệu chuyến gần đây <span>{dashboard.latestTrips?.date || ''}</span></h2></div><div className="dashboard-card-actions"><strong>{totalTrips(trips).toLocaleString('vi-VN')} chuyến</strong><button type="button" className="c2-image-export" title="Xuất ảnh" aria-label="Xuất ảnh dữ liệu chuyến gần đây" onClick={() => void exportImage(latestTripsCard.current, 'SoChuyenXe')}><ImageExportIcon /></button></div></div>
        <div className="dashboard-module-table-wrap" tabIndex={0} aria-label="Dữ liệu chuyến gần đây — cuộn ngang để xem đủ cột"><table><thead><tr><th scope="col">Dự án</th><th scope="col">Biển số xe</th><th scope="col">Số chuyến</th><th scope="col">Số phiếu</th></tr></thead><tbody>{trips.length ? trips.map((trip, index) => <tr key={`${trip.project}-${trip.vehicle}-${index}`}><td>{trip.project || '-'}</td><td>{trip.vehicle || '-'}</td><td>{Number(trip.count || 0).toLocaleString('vi-VN')}</td><td>{trip.ticket || '-'}</td></tr>) : <tr><td colSpan={4} className="dashboard-module-empty">Chưa có dữ liệu chuyến xe của ngày mới nhất.</td></tr>}</tbody></table></div>
      </section>
      <section className="dashboard-module-card" ref={summaryCard} aria-labelledby="summary-title"><div className="dashboard-module-card-head"><div><h2 id="summary-title">Kết quả kinh doanh theo tháng</h2></div><button type="button" className="c2-image-export" title="Xuất ảnh" aria-label="Xuất ảnh kết quả kinh doanh" onClick={() => void exportImage(summaryCard.current, 'TongQuan')}><ImageExportIcon /></button></div>
        <div className="dashboard-module-table-wrap" tabIndex={0} aria-label="Kết quả kinh doanh — cuộn ngang để xem đủ cột"><table><thead><tr>{['Tháng','Tổng khối lượng','Tổng doanh thu','Thuế TNDN','Thuế VAT','Dầu Quang Minh','Dầu đổ ngoài','Phí đường bộ','Lợi nhuận gộp','Chi quỹ thực tế','Lợi nhuận thực'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.month}>{Array.from({ length: 11 }, (_, index) => <td key={index}>{index === 8 ? currency(row.gross) : String(row.raw[index] ?? '')}</td>)}</tr>) : <tr><td colSpan={11} className="dashboard-module-empty">Chưa có dữ liệu báo cáo tài chính.</td></tr>}</tbody></table></div>
      </section>
    </> : null}
  </section>;
}
