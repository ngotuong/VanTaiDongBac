'use client';

import { useMemo, useRef, useState } from 'react';
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

function moneyParts(value: number) {
  const abs = Math.abs(value);
  const signed = value < 0 ? '-' : '';
  if (abs >= 1e9) return { value: signed + (abs / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }), unit: 'tỷ' };
  if (abs >= 1e6) return { value: signed + (abs / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }), unit: 'triệu' };
  return { value: value.toLocaleString('vi-VN'), unit: 'đ' };
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

function KpiIcon({ tone, kind }: { tone: string; kind: number }) {
  return <div className={`kpi-icon-badge ${tone}`}>
    {kind === 0 ? <svg className="btn-svg" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> : null}
    {kind === 1 ? <svg className="btn-svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> : null}
    {kind === 2 ? <svg className="btn-svg" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> : null}
    {kind === 3 ? <svg className="btn-svg" viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M7 10h.01M17 14h.01M12 12a2 2 0 1 0 0 .01"/></svg> : null}
    {kind === 4 ? <svg className="btn-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> : null}
  </div>;
}

export function DashboardModule({ initialDashboard, initialError = '' }: { initialDashboard: DashboardBundle | null; initialError?: string }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedMonth, setSelectedMonth] = useState('latest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const latestTripsCard = useRef<HTMLElement>(null);
  const summaryCard = useRef<HTMLElement>(null);
  const rows = useMemo(() => parseRows(dashboard?.overview?.months), [dashboard]);
  const selectedIndex = selectedMonth === 'latest' ? rows.length - 1 : rows.findIndex((row) => row.month === selectedMonth);
  const selected = rows[selectedIndex];
  const previous = selectedIndex > 0 ? rows[selectedIndex - 1] : null;
  const trips = dashboard?.latestTrips?.trips || [];
  const chartRows = rows.slice(-12);
  const chartStep = 500_000_000;
  const chartMax = Math.max(chartStep, Math.ceil(Math.max(...chartRows.map((row) => Math.abs(row.final)), 1) / chartStep) * chartStep);
  const ticks = Array.from({ length: Math.floor(chartMax / chartStep) + 1 }, (_, index) => chartMax - index * chartStep);
  const metrics = selected ? [
    ['Tổng doanh thu', selected.revenue, 'blue'], ['Chi phí vận hành', selected.operatingCost, 'red'], ['Lợi nhuận gộp', selected.gross, 'amber'],
    ['Chi phí sau vận hành', selected.cashCost, 'red'], ['Lợi nhuận thực tế', selected.final, selected.final >= 0 ? 'green' : 'red']
  ] as const : [];
  const time = dashboard?.updatedAt?.split(' ')[1] || '';

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
  const growth = (value: number, oldValue: number | undefined, invert = false) => {
    if (!oldValue) return { text: '-', tone: 'ok' };
    const pct = (value - oldValue) / Math.abs(oldValue) * 100;
    const good = invert ? pct <= 0 : pct >= 0;
    return { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`, tone: good ? 'ok' : 'err' };
  };

  return <div id="dashboardLegacyRoot">
    <button type="button" data-shell-refresh onClick={refresh} hidden aria-hidden="true" />
    <span className="platform-visually-hidden" role="status" aria-live="polite">{loading ? 'Đang tải tổng quan' : 'Tổng quan đã sẵn sàng'}</span>
    {loading && !dashboard ? <div className="platform-visually-hidden" aria-busy="true">Đang tải dữ liệu</div> : null}
    <div className="panel dashboard-month-filter">
      <div className="dashboard-month-filter-title"><svg className="btn-svg" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>Tháng</div>
      <select aria-label="Kỳ hiển thị" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
        <option value="latest">Tháng gần nhất</option>{rows.map((row) => <option value={row.month} key={row.month}>{row.month}</option>)}
      </select>
    </div>

    {error ? <div className="sync-toast show error" role="alert">{error}</div> : null}
    <div className="kpi-grid" id="metrics">
      {loading && !dashboard ? Array.from({ length: 5 }, (_, index) => <article className="kpi-card" key={index}><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>) : null}
      {metrics.map(([label, value, tone], index) => {
        const parts = moneyParts(value);
        const old = previous ? [previous.revenue, previous.operatingCost, previous.gross, previous.cashCost, previous.final][index] : undefined;
        const delta = growth(value, old, index === 1 || index === 3);
        return <article className="kpi-card" key={label}>
          <div className="kpi-card-header"><div className="kpi-label">{label}</div><KpiIcon tone={tone} kind={index}/></div>
          <div className={`kpi-value ${tone}`}>{parts.value} <span className="unit">{parts.unit}</span></div>
          <div className="kpi-card-footer"><div className={`kpi-status ${delta.tone}`}><span>{delta.text}</span></div><div className="kpi-time">{time}</div></div>
        </article>;
      })}
    </div>

    <section className="panel dashboard-profit-panel">
      <div className="panel-head"><div><h2 className="panel-title">Biểu đồ lợi nhuận thực tế</h2><div className="panel-note">Dữ liệu được cập nhật tự động từ BC_TongQuan</div></div></div>
      <div className="panel-body"><div className="chart" id="profitChart">
        {chartRows.length ? <div className="chart-wrapper">
          <div className="chart-y-axis">{ticks.map((tick) => <div key={tick}>{shortMoney(tick)}</div>)}</div>
          <div className="chart-area">
            <div className="chart-grid-lines">{ticks.map((tick) => <div className={tick === 0 ? 'zero' : ''} key={tick}/>)}</div>
            <div className="chart-v">{chartRows.map((row) => <div className="chart-col" key={row.month}>
              <div className="bar-value">{currency(row.final)}</div>
              <div className="bar-track-v"><div className={`bar-fill-v${row.final < 0 ? ' negative' : ''}`} style={{ height: `${Math.max(2, Math.round(Math.abs(row.final) / chartMax * 100))}%` }}/></div>
              <div className="bar-label">{row.month}</div>
            </div>)}</div>
          </div>
        </div> : <div className="panel-note">Chưa có dữ liệu báo cáo lợi nhuận.</div>}
      </div></div>
    </section>

    <section className="panel table-card dashboard-table-card" ref={latestTripsCard}>
      <div className="table-card-head"><div><div className="table-title">Dữ liệu chuyến gần đây <span className="dashboard-table-date">{dashboard?.latestTrips?.date || ''}</span></div></div>
        <div className="dashboard-card-actions"><span className="dashboard-trip-total">{totalTrips(trips).toLocaleString('vi-VN')} chuyến</span><button type="button" className="sub-tab dashboard-image-export" title="Xuất ảnh" aria-label="Xuất ảnh dữ liệu chuyến gần đây" onClick={() => void exportImage(latestTripsCard.current, 'SoChuyenXe')}><ImageExportIcon /></button></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th style={{ width: '28%' }}>Dự án</th><th style={{ width: '26%' }}>Biển số xe</th><th style={{ width: '20%' }}>Số chuyến chạy</th><th style={{ width: '26%' }}>Số phiếu</th></tr></thead>
        <tbody>{trips.length ? trips.map((trip, index) => <tr key={`${trip.project}-${trip.vehicle}-${index}`}><td>{trip.project || '-'}</td><td>{trip.vehicle || '-'}</td><td>{Number(trip.count || 0).toLocaleString('vi-VN')}</td><td>{trip.ticket || '-'}</td></tr>) : <tr><td colSpan={4} className="dashboard-empty-cell">Chưa có dữ liệu chuyến xe của ngày mới nhất.</td></tr>}</tbody>
      </table></div>
    </section>

    <section className="panel table-card dashboard-table-card" ref={summaryCard}>
      <div className="table-card-head"><div className="table-title">Kết quả kinh doanh theo tháng</div><button type="button" className="sub-tab dashboard-image-export" title="Xuất ảnh" aria-label="Xuất ảnh kết quả kinh doanh" onClick={() => void exportImage(summaryCard.current, 'TongQuan')}><ImageExportIcon /></button></div>
      <div className="table-wrap"><table><thead><tr>{['Tháng','Tổng khối lượng','Tổng doanh thu','Thuế TNDN','Thuế VAT','Dầu Quang Minh','Dầu đổ ngoài','Phí đường bộ','Lợi nhuận gộp','Chi quỹ thực tế','Lợi nhuận thực'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={row.month}>{Array.from({ length: 11 }, (_, index) => <td key={index}>{index === 8 ? currency(row.gross) : String(row.raw[index] ?? '')}</td>)}</tr>) : <tr><td colSpan={11} className="dashboard-empty-cell">Chưa có dữ liệu báo cáo tài chính.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
