'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DashboardBundle, DashboardDataResponse, DashboardTrip } from '../../lib/platform/dashboard-types';
import { aggregateDashboardPeriod, buildKpiMap, buildProfitChartScale, countUniqueVehicles, formatCurrencyText, growth, metricValue, parseDashboardRows, profitChartMonthLabels, type DashboardMetricKey, type DashboardMonthRow } from '../../lib/platform/dashboard-c2';
import { publishDataSourceMeta } from '../../lib/platform/data-source-meta';
import { exportCardAsImage } from '../../lib/platform/export-card';
import { showToast } from '../../lib/platform/toast';
import { useWorkbookContext } from '../platform/WorkbookContextProvider';
import { useVisibleRevalidation } from '../platform/useVisibleRevalidation';

type MetricSpec = { key: DashboardMetricKey; label: string; fullLabel: string; badge: 'blue' | 'red' | 'amber' | 'green'; invert?: boolean; icon: React.ReactNode };
const dashboardResponseCache = new Map<string, DashboardDataResponse>();
const dashboardInflight = new Map<string, Promise<DashboardDataResponse>>();

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

async function requestDashboard(year: string, forceRefresh = false, bypassClientCache = false): Promise<DashboardDataResponse> {
  if (!forceRefresh && !bypassClientCache && dashboardResponseCache.has(year)) return dashboardResponseCache.get(year)!;
  if (!forceRefresh && !bypassClientCache && dashboardInflight.has(year)) return dashboardInflight.get(year)!;
  const url = new URL('/dashboard-data/', window.location.origin);
  url.searchParams.set('year', year);
  if (forceRefresh) url.searchParams.set('forceRefresh', 'true');
  const request = (async () => {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    dashboardResponseCache.set(year, payload);
    return payload;
  })();
  if (!forceRefresh && !bypassClientCache) dashboardInflight.set(year, request);
  try { return await request; } finally { if (dashboardInflight.get(year) === request) dashboardInflight.delete(year); }
}

function BodyPortal({ children }: { children: React.ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body);
}

function periodLabel(start: string, end: string) {
  if (!start || !end) return 'Chưa có kỳ';
  return start === end ? start : `${start}–${end}`;
}

function DashboardPeriodDrawer({ months, start, end, onApply, onClose }: { months: string[]; start: string; end: string; onApply: (start: string, end: string) => void; onClose: () => void }) {
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    document.body.classList.add('dashboard-period-drawer-open');
    const enterFrame = window.requestAnimationFrame(() => titleRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('dashboard-period-drawer-open');
      window.cancelAnimationFrame(enterFrame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const startIndex = Math.max(0, months.indexOf(draftStart));
  const endOptions = months.slice(startIndex);
  const changeStart = (value: string) => {
    setDraftStart(value);
    if (months.indexOf(draftEnd) < months.indexOf(value)) setDraftEnd(value);
  };
  const apply = () => {
    onApply(draftStart, draftEnd);
    onClose();
  };
  const latestMonth = months.at(-1) || '';
  const now = new Date();
  const calendarMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const currentMonth = months.includes(calendarMonth) ? calendarMonth : latestMonth;
  const currentIndex = Math.max(0, months.indexOf(currentMonth));
  const previousMonth = months[Math.max(0, currentIndex - 1)] || currentMonth;
  const recentStart = months[Math.max(0, currentIndex - 2)] || currentMonth;
  const currentYear = currentMonth.split('/')[1] || '';
  const yearStart = months.find((month) => month.endsWith(`/${currentYear}`)) || months[0] || currentMonth;
  const presets = [
    { label: 'Tháng này', start: currentMonth, end: currentMonth },
    { label: 'Tháng trước', start: previousMonth, end: previousMonth },
    { label: '3 tháng gần nhất', start: recentStart, end: currentMonth },
    { label: 'Năm nay', start: yearStart, end: currentMonth }
  ];

  return <BodyPortal>
    <div className="dashboard-period-backdrop" aria-hidden="true" onClick={onClose}/>
    <section
      className="dashboard-period-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-period-title"
    >
      <header className="dashboard-period-drawer-head">
        <h2 id="dashboard-period-title" ref={titleRef} tabIndex={-1}>Chọn kỳ Tổng quan</h2>
        <button type="button" className="dashboard-period-close" aria-label="Đóng bộ lọc kỳ" onClick={onClose}>
          <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div className="dashboard-period-drawer-body">
        <div className="dashboard-period-presets" aria-label="Chọn kỳ nhanh">
          {presets.map((preset) => <button
            type="button"
            key={preset.label}
            className={draftStart === preset.start && draftEnd === preset.end ? 'active' : ''}
            aria-pressed={draftStart === preset.start && draftEnd === preset.end}
            onClick={() => { setDraftStart(preset.start); setDraftEnd(preset.end); }}
          >{preset.label}</button>)}
        </div>
        <div className="dashboard-period-fields">
          <label><span>Từ tháng</span><select className="platform-content-select" value={draftStart} onChange={(event) => changeStart(event.target.value)}>{months.map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
          <label><span>Đến tháng</span><select className="platform-content-select" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)}>{endOptions.map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
        </div>
        <p className="dashboard-period-preview" aria-live="polite">Kỳ đang chọn: <strong>{periodLabel(draftStart, draftEnd)}</strong></p>
      </div>
      <footer className="dashboard-period-drawer-footer">
        <button type="button" className="dashboard-period-all" onClick={() => { setDraftStart(months[0]); setDraftEnd(months[months.length - 1]); }}>Tất cả kỳ</button>
        <button type="button" className="dashboard-period-apply" onClick={apply}>Áp dụng</button>
      </footer>
    </section>
  </BodyPortal>;
}

function HeroMetricCard({ row, previous, kpiMap, selectedPeriod, onOpenPeriod }: { row?: DashboardMonthRow; previous?: DashboardMonthRow; kpiMap: ReturnType<typeof buildKpiMap>; selectedPeriod: string; onOpenPeriod: () => void }) {
  const value = row ? metricValue(row, HERO_SPEC.key, kpiMap) : 0;
  const previousValue = previous ? metricValue(previous, HERO_SPEC.key, kpiMap) : undefined;
  const comparison = growth(value, previousValue, false);
  const isNegative = value < 0;
  return <article className={`kpi-hero-card dashboard-kpi-card ${isNegative ? 'dashboard-tone-profit-negative' : 'dashboard-tone-profit-positive'}`}>
    <div className="kpi-hero-header">
      <div className="kpi-hero-label">{HERO_SPEC.label.toUpperCase()}</div>
      <div className="kpi-hero-select-wrap dashboard-period-control">
        <span className="dashboard-month-title">{selectedPeriod}</span>
        <button type="button" className="dashboard-period-trigger" aria-label={`Chọn kỳ Tổng quan, hiện tại ${selectedPeriod}`} aria-haspopup="dialog" onClick={onOpenPeriod}>
          <svg className="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2"/></svg>
        </button>
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

type ProfitChartMonth = { month: string; row: DashboardMonthRow | null };

function ProfitChart({ months }: { months: ProfitChartMonth[] }) {
  const data = months.filter((item) => item.row);
  if (!data.length) return <div className="panel-note">Chưa có dữ liệu báo cáo lợi nhuận.</div>;
  const scale = buildProfitChartScale(data.map((item) => item.row?.final || 0));
  const short = (value: number) => Math.abs(value) >= 1e9 ? `${(value / 1e9).toFixed(1).replace('.', ',').replace(',0', '')} tỷ` : Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(0)} tr` : String(value);
  return <div className="chart-wrapper profit-chart">
    <div className="chart-y-axis profit-chart-y-axis tabular-nums">
      {scale.ticks.map((tick) => <div key={tick.value} style={{ top: `${tick.positionPercent}%` }}>{short(tick.value)}</div>)}
    </div>
    <div className="chart-area profit-chart-area">
      <div className="chart-grid-lines profit-chart-grid" aria-hidden="true">
        {scale.ticks.map((tick) => <div className={tick.value === 0 ? 'is-zero' : ''} key={tick.value} style={{ top: `${tick.positionPercent}%` }}/>) }
      </div>
      <div className="chart-v profit-chart-bars">
        {months.map(({ month, row }) => {
          const value = row?.final || 0;
          const valuePosition = scale.positionPercent(value);
          const rawBarHeight = Math.abs(valuePosition - scale.zeroPositionPercent);
          const barHeight = value === 0 ? 0 : Math.max(2, rawBarHeight);
          const barTop = value > 0 ? scale.zeroPositionPercent - barHeight : scale.zeroPositionPercent;
          return <div className={`chart-col${row ? '' : ' is-empty'}`} key={month}>
            <div className="bar-value tabular-nums">{row ? `${row.final < 0 ? '-' : ''}${formatCurrencyText(Math.abs(row.final))}` : '—'}</div>
            <div className="profit-bar-plot">
              <div className="bar-track-v">
                {row && value !== 0 ? <div
                  aria-label={`Lợi nhuận thực tháng ${month}: ${formatCurrencyText(value)}`}
                  className={`bar-fill-v ${value < 0 ? 'is-negative' : 'is-positive'}`}
                  role="img"
                  style={{ top: `${barTop}%`, height: `${barHeight}%` }}
                /> : null}
              </div>
            </div>
            <div className="bar-label">{month}</div>
          </div>;
        })}
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
  const wardFee = row.wardFee || 0;
  const wardAndRoadFee = roadFee + wardFee;
  const netProfit = row.final;

  const payrollCost = row.payroll || Number(kpi?.payroll || 0);
  const bhxhCost = row.bhxh || Number(kpi?.bhxh || 0);
  const fundCost = row.fund || Number(kpi?.fund || 0);

  const allCategories = [
    { label: 'Xăng dầu', value: Math.max(0, totalFuel), chartValue: Math.max(0, totalFuel), color: '#f97316' },
    { label: 'Phường & Luật', value: Math.max(0, wardAndRoadFee), chartValue: Math.max(0, wardAndRoadFee), color: '#8b5cf6' },
    { label: 'Thuế DN & VAT', value: Math.max(0, taxTNDN + taxVAT), chartValue: Math.max(0, taxTNDN + taxVAT), color: '#ef4444' },
    { label: 'Chi lương', value: Math.max(0, payrollCost), chartValue: Math.max(0, payrollCost), color: '#f59e0b' },
    { label: 'BHXH', value: Math.max(0, bhxhCost), chartValue: Math.max(0, bhxhCost), color: '#0d9488' },
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
  const { workbook } = useWorkbookContext();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [periodRange, setPeriodRange] = useState({ start: '', end: '' });
  const [periodDrawerOpen, setPeriodDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const rows = useMemo(() => parseDashboardRows(dashboard?.overview?.months), [dashboard]);
  const kpiMap = useMemo(() => buildKpiMap(dashboard?.overview?.kpis), [dashboard]);
  const monthList = useMemo(() => [...new Set(rows.map((row) => row.month))], [rows]);
  const latestMonth = monthList[monthList.length - 1] || '';
  const effectiveStart = monthList.includes(periodRange.start) ? periodRange.start : latestMonth;
  const effectiveEnd = monthList.includes(periodRange.end) && monthList.indexOf(periodRange.end) >= monthList.indexOf(effectiveStart) ? periodRange.end : effectiveStart;
  const startIndex = Math.max(0, monthList.indexOf(effectiveStart));
  const endIndex = Math.max(startIndex, monthList.indexOf(effectiveEnd));
  const selectedRows = rows.slice(startIndex, endIndex + 1);
  const selectedPeriod = periodLabel(effectiveStart, effectiveEnd);
  const chartYear = effectiveEnd.split('/')[1] || latestMonth.split('/')[1] || workbook.year;
  const profitChartMonths = useMemo<ProfitChartMonth[]>(() => {
    const byMonth = new Map(rows.map((row) => [row.month, row]));
    return profitChartMonthLabels(chartYear).map((month) => ({ month, row: byMonth.get(month) || null }));
  }, [rows, chartYear]);
  const selected = useMemo(() => aggregateDashboardPeriod(selectedRows, kpiMap, selectedPeriod), [selectedRows, kpiMap, selectedPeriod]);
  const previous = useMemo(() => {
    const periodLength = selectedRows.length;
    if (!periodLength || startIndex < periodLength) return undefined;
    const previousRows = rows.slice(startIndex - periodLength, startIndex);
    return aggregateDashboardPeriod(previousRows, kpiMap, periodLabel(previousRows[0]?.month || '', previousRows[previousRows.length - 1]?.month || ''));
  }, [rows, selectedRows, startIndex, kpiMap]);
  const trips = dashboard?.latestTrips?.trips || [];
  const uniqueVehicleCount = countUniqueVehicles(trips);

  useEffect(() => {
    publishDataSourceMeta(dashboard);
  }, [dashboard]);

  const refresh = async () => {
    setLoading(true); setError('');
    showToast('Đang tải dữ liệu Tổng quan từ Supabase…', 'loading');
    try { const data = await requestDashboard(workbook.year, false, true); setDashboard(data.dashboard); showToast('Dữ liệu Tổng quan đã được cập nhật.', 'success'); }
    finally { setLoading(false); }
  };

  useVisibleRevalidation(async () => {
    if (loading) return;
    const data = await requestDashboard(workbook.year, false, true);
    setDashboard(data.dashboard);
    setError('');
  }, !loading);

  return <section className="view active" data-next-dashboard="true" aria-label="Tổng quan kết quả kinh doanh">
    <button type="button" data-shell-refresh hidden onClick={refresh} aria-hidden="true" tabIndex={-1}/>
    <span className="platform-visually-hidden" role="status" aria-live="polite">{loading ? 'Đang cập nhật dữ liệu.' : error}</span>
    {error ? <div className="panel" role="alert" style={{ padding: 16, marginBottom: 20 }}>{error}{!dashboard ? <button type="button" onClick={refresh} disabled={loading}>Thử lại</button> : null}</div> : null}
    <div className="dashboard-module-kpis" style={{ marginBottom: 20 }}>
      {selected ? <HeroMetricCard row={selected} previous={previous} kpiMap={kpiMap} selectedPeriod={selectedPeriod} onOpenPeriod={() => setPeriodDrawerOpen(true)}/> : <article className="kpi-hero-card" aria-busy="true"><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>}
      <div className="kpi-sub-grid">
        {selected ? SUB_METRICS.map((spec) => <SubMetricCard key={spec.key} spec={spec} row={selected} previous={previous} kpiMap={kpiMap}/>) : SUB_METRICS.map((spec) => <article className="kpi-card" key={spec.key} aria-busy="true"><div className="shimmer shimmer-text"/><div className="shimmer shimmer-value"/></article>)}
      </div>
    </div>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div><div className="table-title">Biểu Đồ Lợi Nhuận Thực <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({chartYear})</span></div></div>
        <div className="dashboard-export-actions"><ExportButton title="Lợi nhuận thực"/></div>
      </div>
      <div className="table-wrap" style={{ padding: '0 16px 16px' }}><ProfitChart months={profitChartMonths}/></div>
    </section>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div className="table-title" aria-label="Biểu Đồ Cơ Cấu Chi Phí & Lợi Nhuận (Kết quả kinh doanh theo tháng)">Biểu Đồ Cơ Cấu Chi Phí & Lợi Nhuận <span style={{ opacity: 0.85, fontWeight: 700, fontSize: '0.9em', marginLeft: 4 }}>({selectedPeriod})</span></div>
        <div className="dashboard-export-actions"><ExportButton title="Cơ cấu chi phí & lợi nhuận"/></div>
      </div>
      <div className="table-wrap" style={{ padding: '0 16px 16px' }}><FinancialDonutChart row={selected}/></div>
    </section>
    <section className="table-card high-density-table" style={{ marginBottom: 20 }}>
      <div className="table-card-head">
        <div><div className="table-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>Dữ Liệu Chuyến Gần Đây{dashboard?.latestTrips?.date ? <span style={{ color: '#a7f3d0', fontWeight: 700, fontSize: 13 }}>({dashboard.latestTrips.date})</span> : null}</div></div>
        <div className="dashboard-export-actions"><ExportButton title="Số chuyến xe"/></div>
      </div>
      <div className="table-wrap"><table className="dashboard-latest-trips-table"><thead><tr><th style={{ width: '22%', textAlign: 'left' }}>Dự án</th><th style={{ width: '22%', textAlign: 'left' }}>Biển số xe</th><th style={{ width: '20%', textAlign: 'left' }}>Số chuyến</th><th style={{ width: '36%', textAlign: 'left' }}>Số phiếu</th></tr></thead><tbody>{trips.length ? <>{trips.map((trip: DashboardTrip, index) => <tr key={`${trip.project}-${trip.vehicle}-${index}`}><td style={{ fontWeight: 600, textAlign: 'left' }}>{trip.project || '-'}</td><td className="dashboard-trip-vehicle" style={{ fontWeight: 700, textAlign: 'left' }}>{trip.vehicle || ''}</td><td className="tabular-nums" style={{ fontWeight: 600, textAlign: 'left' }}>{Number(trip.count || 0).toLocaleString('vi-VN')}</td><td className="dashboard-trip-ticket" style={{ textAlign: 'left' }}>{trip.ticket || '-'}</td></tr>)}<tr className="total-row" style={{ position: 'sticky', bottom: 0, fontWeight: 800 }}><td style={{ fontWeight: 800, textAlign: 'left' }}>Tổng cộng</td><td className="dashboard-trip-total" style={{ fontWeight: 800, textAlign: 'left' }}>{uniqueVehicleCount ? `${uniqueVehicleCount} xe` : '-'}</td><td className="dashboard-trip-total tabular-nums" style={{ fontWeight: 800, textAlign: 'left' }}>{trips.reduce((sum, trip) => sum + Number(trip.count || 0), 0).toLocaleString('vi-VN')}</td><td style={{ textAlign: 'left' }}/></tr></> : <tr><td colSpan={4} className="dashboard-trip-ticket" style={{ textAlign: 'center', padding: 24 }}>Chưa có dữ liệu chuyến xe của ngày mới nhất.</td></tr>}</tbody></table></div>
    </section>
    {periodDrawerOpen && monthList.length ? <DashboardPeriodDrawer months={monthList} start={effectiveStart} end={effectiveEnd} onApply={(start, end) => setPeriodRange({ start, end })} onClose={() => setPeriodDrawerOpen(false)}/> : null}
  </section>;
}
