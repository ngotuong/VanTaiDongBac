'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardBundle, DashboardDataResponse, DashboardTrip } from '../../lib/platform/dashboard-types';
import { buildKpiMap, countUniqueVehicles, formatCurrencyText, growth, metricValue, parseDashboardRows, type DashboardMetricKey, type DashboardMonthRow } from '../../lib/platform/dashboard-c2';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { exportCardAsImage } from '../../lib/platform/export-card';
import { showToast } from '../../lib/platform/toast';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

type MetricSpec = { key: DashboardMetricKey; label: string; fullLabel: string; badge: 'blue' | 'red' | 'amber' | 'green'; invert?: boolean; icon: React.ReactNode };
let dashboardResponseCache: DashboardDataResponse | null = null;
let dashboardInflight: Promise<DashboardDataResponse> | null = null;

const HERO_SPEC: MetricSpec = {
  key: 'final',
  label: 'Lợi Nhuận Thực',
  fullLabel: 'Lợi Nhuận Thực Tế',
  badge: 'blue',
  icon: <svg className="btn-svg" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
};

const SUB_METRICS: MetricSpec[] = [
  { key: 'revenue', label: 'Doanh Thu', fullLabel: 'Tổng Doanh Thu', badge: 'blue', icon: <svg className="btn-svg" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
  { key: 'operatingCost', label: 'Chi Phí Vận Hành', fullLabel: 'Chi Phí Vận Hành', badge: 'red', invert: true, icon: <svg className="btn-svg" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
  { key: 'gross', label: 'Lợi Nhuận Gộp', fullLabel: 'Lợi Nhuận Gộp', badge: 'blue', icon: <svg className="btn-svg" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { key: 'cashCost', label: 'Chi Phí Sau Vận Hành', fullLabel: 'Chi Phí Sau Vận Hành', badge: 'red', invert: true, icon: <svg className="btn-svg" viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="M7 10h.01M17 14h.01M12 12a2 2 0 1 0 0 .01"/></svg> }
];

async function requestDashboard(forceRefresh = false, bypassClientCache = false): Promise<DashboardDataResponse> {
  if (!forceRefresh && !bypassClientCache && dashboardResponseCache) return dashboardResponseCache;
  if (!forceRefresh && !bypassClientCache && dashboardInflight) return dashboardInflight;
  const url = new URL('/dashboard-data/', window.location.origin);
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const request = (async () => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    dashboardResponseCache = payload;
    return payload;
  })();
  if (!forceRefresh && !bypassClientCache) dashboardInflight = request;
  try { return await request; } finally { dashboardInflight = null; }
}

function HeroMetricCard({ row, previous, kpiMap, effectiveMonth, months, onSelectMonth }: { row?: DashboardMonthRow; previous?: DashboardMonthRow; kpiMap: ReturnType<typeof buildKpiMap>; effectiveMonth: string; months: string[]; onSelectMonth: (month: string) => void }) {
  const value = row ? metricValue(row, HERO_SPEC.key, kpiMap) : 0;
  const previousValue = previous ? metricValue(previous, HERO_SPEC.key, kpiMap) : undefined;
  const comparison = growth(value, previousValue, false);
  const isNegative = value < 0;
  return <article className={`kpi-hero-card dashboard-kpi-card ${isNegative ? 'dashboard-tone-profit-negative' : 'dashboard-tone-profit-positive'}`}>
    <div className="kpi-hero-header">
      <div className="kpi-hero-label">{HERO_SPEC.label.toUpperCase()}</div>
      <div className="dashboard-month-title platform-visually-hidden">{effectiveMonth}</div>
      <div className="kpi-hero-select-wrap">
        <select aria-label="Chọn tháng tổng quan" className="kpi-hero-select" value={effectiveMonth} onChange={(event) => onSelectMonth(event.target.value)}>
          {months.map((m) => <option value={m} key={m}>{m === 'Tất cả' ? 'Tất cả tháng' : m}</option>)}
        </select>
      </div>
    </div>
    <div className={`kpi-hero-value tabular-nums ${isNegative ? 'is-negative' : 'is-positive'}`}>{formatCurrencyText(value)}</div>
    <div className="kpi-hero-footer">
      <span className={`kpi-hero-status ${comparison.statusClass === 'ok' ? 'status-up' : 'status-down'}`}>{comparison.text}</span>
    </div>
  </article>;
}

function SubMetricCard({ spec, row, previous, kpiMap }: { spec: MetricSpec; row: DashboardMonthRow; previous?: DashboardMonthRow; kpiMap: ReturnType<typeof buildKpiMap> }) {
  const value = metricValue(row, spec.key, kpiMap);
  const previousValue = previous ? metricValue(previous, spec.key, kpiMap) : undefined;
  const comparison = growth(value, previousValue, spec.invert);
  const badgeClass = (spec.key === 'gross' || spec.key === 'final') ? (value < 0 ? 'red' : 'blue') : spec.badge;
  const toneClass = spec.key === 'revenue' ? 'dashboard-tone-revenue' : spec.key === 'operatingCost' || spec.key === 'cashCost' ? 'dashboard-tone-operating-cost' : value < 0 ? 'dashboard-tone-profit-negative' : 'dashboard-tone-gross';
  return <article className={`kpi-card kpi-sub-card dashboard-kpi-card ${toneClass}`}>
    <div className="kpi-card-header">
      <div className="kpi-label" title={spec.fullLabel}>{spec.label}</div>
    </div>
    <div className={`kpi-value tabular-nums ${badgeClass}`}>{formatCurrencyText(value)}</div>
    <div className="kpi-card-footer">
      <div className={`kpi-status ${comparison.statusClass === 'ok' ? 'status-up' : 'status-down'}`}><span>{comparison.text}</span></div>
    </div>
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
    <div className="chart-y-axis tabular-nums" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 130, paddingRight: 12, textAlign: 'right', width: 60, color: 'var(--muted)', fontSize: 10, fontWeight: 600, marginBottom: 23, flexShrink: 0, borderRight: '1px solid var(--line)' }}>{ticks.map((value) => <div key={value}>{short(value)}</div>)}</div>
    <div className="chart-area" style={{ flex: 1, position: 'relative', overflowX: 'auto' }}>
      <div className="chart-grid-lines" style={{ position: 'absolute', left: 0, right: 0, height: 130, bottom: 23, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 1 }}>{ticks.map((value) => <div key={value} style={{ borderBottom: value === 0 ? '2px solid var(--muted)' : '1px dashed var(--line)', width: '100%' }}/>)}</div>
      <div className="chart-v" style={{ position: 'relative', zIndex: 2, background: 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 190, width: '100%', gap: 8 }}>
        {data.map((row) => { const percent = Math.max(2, Math.round(Math.abs(row.final) / max * 100)); return <div className="chart-col" key={row.month}>
          <div className="bar-value tabular-nums">{row.final < 0 ? '-' : ''}{formatCurrencyText(Math.abs(row.final))}</div>
          <div className="bar-track-v"><div className="bar-fill-v" style={{ height: `${percent}%`, borderRadius: '6px 6px 0 0', background: row.final < 0 ? 'linear-gradient(180deg, #f87171, var(--red))' : 'linear-gradient(180deg, var(--teal), var(--deep-2))', width: '100%' }}/></div>
          <div className="bar-label">{row.month}</div>
        </div>; })}
      </div>
    </div>
  </div>;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  const cleaned = String(val ?? '').replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
  return Number(cleaned) || 0;
}

function FinancialDonutChart({ row, kpi }: { row?: DashboardMonthRow; kpi?: ReturnType<typeof buildKpiMap> extends Map<string, infer T> ? T : undefined }) {
  if (!row) return <div className="panel-note">Chưa có dữ liệu báo cáo tài chính.</div>;

  const raw = row.raw || [];
  const taxTNDN = row.taxTndn ?? parseNum(raw[3]);
  const taxVAT = row.taxVat ?? parseNum(raw[4]);
  const fuelQM = row.fuelQm ?? parseNum(raw[5]);
  const fuelOutside = row.fuelOut ?? parseNum(raw[6]);
  const totalFuel = fuelQM + fuelOutside || Number(kpi?.fuelOut || 0);
  const roadFee = row.roadFee ?? parseNum(raw[7]);
  const netProfit = row.final;

  const payrollCost = row.payroll || Number(kpi?.payroll || 0);
  const fundCost = row.fund || Number(kpi?.fund || 0);

  const allCategories = [
    { label: 'Xăng dầu', value: Math.max(0, totalFuel), chartValue: Math.max(0, totalFuel), color: '#f97316' },
    { label: 'Phí đi đường', value: Math.max(0, roadFee), chartValue: Math.max(0, roadFee), color: '#8b5cf6' },
    { label: 'Thuế DN & VAT', value: Math.max(0, taxTNDN + taxVAT), chartValue: Math.max(0, taxTNDN + taxVAT), color: '#ef4444' },
    { label: 'Chi lương', value: Math.max(0, payrollCost), chartValue: Math.max(0, payrollCost), color: '#f59e0b' },
    { label: 'Chi quỹ', value: Math.max(0, fundCost), chartValue: Math.max(0, fundCost), color: '#64748b' },
    { label: 'Lợi nhuận thực', value: netProfit, chartValue: Math.abs(netProfit), color: netProfit < 0 ? '#dc2626' : '#0284c7' }
  ];

  const validItems = allCategories.filter((item) => item.chartValue > 0);
  const totalSum = validItems.reduce((sum, item) => sum + item.chartValue, 0) || 1;
  const C = 2 * Math.PI * 88; // 552.92
  let currentOffset = 0;

  const slices = validItems.map((item) => {
    const pct = (item.chartValue / totalSum) * 100;
    const strokeLength = (pct / 100) * C;
    const dashOffset = -currentOffset;
    currentOffset += strokeLength;
    return { ...item, pct, strokeLength, dashOffset };
  });

  return (
    <div className="donut-chart-wrapper financial-donut">
      {/* SVG Donut Chart */}
      <div className="financial-donut-visual">
        <svg viewBox="0 0 240 240" role="img" aria-label={`Cơ cấu chi phí và lợi nhuận thực tháng ${row.month}`} style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="120" cy="120" r="88" fill="none" stroke="#f1f5f9" strokeWidth="30" />
          {slices.map((slice, idx) => (
            <circle
              key={idx}
              cx="120"
              cy="120"
              r="88"
              fill="none"
              stroke={slice.color}
              strokeWidth="30"
              strokeDasharray={`${slice.strokeLength} ${C - slice.strokeLength}`}
              strokeDashoffset={slice.dashOffset}
              style={{ transition: 'all 0.4s ease' }}
            >
              <title>{`${slice.label}: ${formatCurrencyText(slice.value)} (${slice.pct.toFixed(1)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="financial-donut-center">
          <div className="financial-donut-center-label">Doanh Thu</div>
          <div className="financial-donut-center-value tabular-nums">{formatCurrencyText(row.revenue)}</div>
          <div className="financial-donut-center-period">{row.month === 'Tất cả' ? 'Tất cả tháng' : `Tháng ${row.month}`}</div>
        </div>
      </div>

      {/* Legend Breakdown List - Hiển thị TỶ LỆ % cùng hàng với tiêu đề, con số tiền ở dòng dưới */}
      <div className="financial-donut-legend" role="list" aria-label="Chi tiết cơ cấu chi phí và lợi nhuận">
        {allCategories.map((item, idx) => {
          const pct = item.chartValue > 0 ? (item.chartValue / totalSum) * 100 : 0;
          const isZero = item.chartValue <= 0;
          return (
            <div key={idx} className={`financial-donut-legend-item${isZero ? ' is-zero' : ''}`} role="listitem">
              <div className="financial-donut-legend-header">
                <div className="financial-donut-legend-label">
                  <span className="financial-donut-legend-dot" style={{ background: isZero ? '#cbd5e1' : item.color }} />
                  <span className="financial-donut-legend-title">{item.label}</span>
                </div>
                <span className="financial-donut-legend-pct tabular-nums">{pct.toFixed(1)}%</span>
              </div>
              <div className="financial-donut-legend-amount tabular-nums" style={{ color: isZero ? 'var(--muted)' : item.color }}>
                {formatCurrencyText(item.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExportButton({ title }: { title: string }) {
  return <button type="button" className="dashboard-export-button" title={`Xuất ảnh ${title}`} aria-label={`Xuất ảnh ${title}`} onClick={(event) => void exportCardAsImage(event.currentTarget, title)}>
    <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  </button>;
}

export function DashboardModule({ initialDashboard, initialError = '' }: { initialDashboard: DashboardBundle | null; initialError?: string }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const rows = useMemo(() => parseDashboardRows(dashboard?.overview?.months), [dashboard]);
  const kpiMap = useMemo(() => buildKpiMap(dashboard?.overview?.kpis), [dashboard]);
  const monthList = useMemo(() => ['Tất cả', ...new Set(rows.map((r) => r.month))], [rows]);
  const effectiveMonth = selectedMonth && monthList.includes(selectedMonth) ? selectedMonth : rows[rows.length - 1]?.month || 'Tất cả';

  const aggregateRow = useMemo((): DashboardMonthRow | undefined => {
    if (!rows.length) return undefined;
    if (effectiveMonth !== 'Tất cả') return rows.find((r) => r.month === effectiveMonth);
    return {
      month: 'Tất cả',
      volume: rows.reduce((sum, r) => sum + r.volume, 0),
      revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
      operatingCost: rows.reduce((sum, r) => sum + r.operatingCost, 0),
      gross: rows.reduce((sum, r) => sum + r.gross, 0),
      cashCost: rows.reduce((sum, r) => sum + r.cashCost, 0),
      final: rows.reduce((sum, r) => sum + r.final, 0),
      taxTndn: rows.reduce((sum, r) => sum + (r.taxTndn || 0), 0),
      taxVat: rows.reduce((sum, r) => sum + (r.taxVat || 0), 0),
      fuelQm: rows.reduce((sum, r) => sum + (r.fuelQm || 0), 0),
      fuelOut: rows.reduce((sum, r) => sum + (r.fuelOut || 0), 0),
      roadFee: rows.reduce((sum, r) => sum + (r.roadFee || 0), 0),
      payroll: rows.reduce((sum, r) => sum + (r.payroll || 0), 0),
      fund: rows.reduce((sum, r) => sum + (r.fund || 0), 0),
      raw: []
    };
  }, [rows, effectiveMonth]);

  const selectedIndex = rows.findIndex((row) => row.month === effectiveMonth);
  const selected = aggregateRow;
  const previous = selectedIndex > 0 ? rows[selectedIndex - 1] : undefined;
  const trips = dashboard?.latestTrips?.trips || [];
  const uniqueVehicleCount = countUniqueVehicles(trips);

  useEffect(() => {
    publishDataSourceMeta(dashboard);
  }, [dashboard]);

  const refresh = async () => {
    setLoading(true); setError('');
    showToast('Đang tải dữ liệu Tổng quan từ Supabase…', 'loading');
    try { const data = await requestDashboard(false, true); setDashboard(data.dashboard); showToast('Dữ liệu Tổng quan đã được cập nhật.', 'success'); }
    finally { setLoading(false); }
  };

  useVisibleRevalidation(async () => {
    if (loading) return;
    const data = await requestDashboard(false, true);
    setDashboard(data.dashboard);
    setError('');
  }, !loading);

  return <section className="view active" data-next-dashboard="true" aria-label="Tổng quan kết quả kinh doanh">
    <button type="button" data-shell-refresh hidden onClick={refresh} aria-hidden="true" tabIndex={-1}/>
    <span className="platform-visually-hidden" role="status" aria-live="polite">{loading ? 'Đang cập nhật dữ liệu.' : error}</span>
    {error ? <div className="panel" role="alert" style={{ padding: 16, marginBottom: 20 }}>{error}{!dashboard ? <button type="button" onClick={refresh} disabled={loading}>Thử lại</button> : null}</div> : null}
    <div className="dashboard-module-kpis" style={{ marginBottom: 20 }}>
      {selected ? <HeroMetricCard row={selected} previous={previous} kpiMap={kpiMap} effectiveMonth={effectiveMonth} months={monthList} onSelectMonth={setSelectedMonth}/> : <article className="kpi-hero-card" aria-busy="true"><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>}
      <div className="kpi-sub-grid">
        {selected ? SUB_METRICS.map((spec) => <SubMetricCard key={spec.key} spec={spec} row={selected} previous={previous} kpiMap={kpiMap}/>) : SUB_METRICS.map((spec) => <article className="kpi-card" key={spec.key} aria-busy="true"><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>)}
      </div>
    </div>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div><div className="table-title">Biểu Đồ Lợi Nhuận Thực <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({effectiveMonth === 'Tất cả' ? 'Tất cả tháng' : effectiveMonth})</span></div></div>
        <div className="dashboard-export-actions"><ExportButton title="Lợi nhuận thực"/></div>
      </div>
      <div className="table-wrap" style={{ padding: '0 16px 16px' }}><ProfitChart rows={rows}/></div>
    </section>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div className="table-title" aria-label="Biểu Đồ Cơ Cấu Chi Phí & Lợi Nhuận (Kết quả kinh doanh theo tháng)">Biểu Đồ Cơ Cấu Chi Phí & Lợi Nhuận <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({effectiveMonth === 'Tất cả' ? 'Tất cả tháng' : effectiveMonth})</span></div>
        <div className="dashboard-export-actions"><ExportButton title="Cơ cấu chi phí & lợi nhuận"/></div>
      </div>
      <div className="table-wrap" style={{ padding: '0 16px 16px' }}><FinancialDonutChart row={selected} kpi={selected ? kpiMap.get(selected.month) : undefined}/></div>
    </section>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div><div className="table-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>Dữ Liệu Chuyến Gần Đây {dashboard?.latestTrips?.date ? <span style={{ color: '#a7f3d0', fontWeight: 700, fontSize: 13 }}>({dashboard.latestTrips.date})</span> : null}</div></div>
        <div className="dashboard-export-actions"><ExportButton title="Số chuyến xe"/></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th style={{ width: '22%', textAlign: 'left' }}>Dự án</th><th style={{ width: '22%', textAlign: 'left' }}>Biển số xe</th><th style={{ width: '20%', textAlign: 'left' }}>Số chuyến</th><th style={{ width: '36%', textAlign: 'left' }}>Số phiếu</th></tr></thead><tbody>{trips.length ? <>{trips.map((trip: DashboardTrip, index) => <tr key={`${trip.project}-${trip.vehicle}-${index}`}><td style={{ fontWeight: 600, textAlign: 'left' }}>{trip.project || '-'}</td><td style={{ fontWeight: 700, color: 'var(--deep)', textAlign: 'left' }}>{trip.vehicle || ''}</td><td className="tabular-nums" style={{ fontWeight: 600, textAlign: 'left' }}>{Number(trip.count || 0).toLocaleString('vi-VN')}</td><td style={{ color: 'var(--muted)', textAlign: 'left' }}>{trip.ticket || '-'}</td></tr>)}<tr className="total-row" style={{ position: 'sticky', bottom: 0, fontWeight: 800 }}><td style={{ fontWeight: 800, color: 'var(--deep)', textAlign: 'left' }}>Tổng cộng</td><td style={{ fontWeight: 800, color: 'var(--teal)', textAlign: 'left' }}>{uniqueVehicleCount ? `${uniqueVehicleCount} xe` : '-'}</td><td className="tabular-nums" style={{ fontWeight: 800, color: 'var(--teal)', textAlign: 'left' }}>{trips.reduce((sum, trip) => sum + Number(trip.count || 0), 0).toLocaleString('vi-VN')}</td><td style={{ textAlign: 'left' }}/></tr></> : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Chưa có dữ liệu chuyến xe của ngày mới nhất.</td></tr>}</tbody></table></div>
    </section>
  </section>;
}
