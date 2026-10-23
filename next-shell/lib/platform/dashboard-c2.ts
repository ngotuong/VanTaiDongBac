import type { DashboardKpi } from './dashboard-types';
import type { ReportCell, ReportMatrix } from './report-types';

export type DashboardMonthRow = {
  month: string;
  volume: number;
  revenue: number;
  operatingCost: number;
  gross: number;
  cashCost: number;
  final: number;
  taxTndn: number;
  taxVat: number;
  fuelQm: number;
  fuelOut: number;
  roadFee: number;
  wardFee: number;
  payroll: number;
  bhxh: number;
  fund: number;
  raw: ReportCell[];
};

export type DashboardMetricKey = 'revenue' | 'operatingCost' | 'gross' | 'cashCost' | 'final';

export function normalizeMonth(input: unknown): string {
  const text = String(input ?? '').trim();
  if (!text || text === 'Tất cả' || text === 'latest') return text;

  const dmyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${m}/${y}`;
  }

  const myMatch = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (myMatch) {
    const m = myMatch[1].padStart(2, '0');
    const y = myMatch[2];
    return `${m}/${y}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    return `${m}/${y}`;
  }

  return text;
}

export function numberValue(value: unknown) {
  const text = String(value ?? '').replace(/[^\d,\-.]/g, '');
  if (!text) return 0;
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeMonthLabel(value: unknown) {
  const normalizedMonth = normalizeMonth(value);
  const text = String(normalizedMonth ?? '').trim();
  if (!text) return '';
  const vn = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (vn) return `${vn[2]}-${String(Number(vn[1])).padStart(2, '0')}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
  return text;
}

export function parseDashboardRows(matrix?: ReportMatrix): DashboardMonthRow[] {
  if (!matrix?.length) return [];
  const headerIndex = matrix.findIndex((row) => String(row?.[0] ?? '').trim().toLowerCase() === 'tháng');
  const headers = (matrix[headerIndex >= 0 ? headerIndex : 0] || []).map((value) => String(value ?? '').trim().toLowerCase());
  const column = (names: string[], fallback: number) => {
    const index = headers.findIndex((header) => names.some((name) => header.includes(name)));
    return index >= 0 ? index : fallback;
  };
  const monthIndex = column(['tháng'], 0);
  const volumeIndex = column(['sản lượng', 'khối lượng'], 1);
  const revenueIndex = column(['doanh thu'], 2);
  const taxTndnIndex = column(['thuế tndn', 'tndn'], 3);
  const taxVatIndex = column(['thuế vat', 'vat'], 4);
  const fuelQmIndex = column(['dầu qm', 'quang minh'], 5);
  const fuelOutIndex = column(['dầu ngoài'], 6);
  const tollIndex = column(['phí đi đường', 'phí đường', 'cầu đường', 'phí cầu đường'], 7);
  const wardFeeIndex = column(['phí phường'], -1);
  const grossIndex = column(['lợi nhuận gộp'], 8);
  const payrollIndex = column(['chi phí lương', 'chi lương', 'lương'], 9);
  const bhxhIndex = column(['bhxh', 'bảo hiểm xã hội'], -1);
  const fundIndex = column(['chi quỹ thực tế', 'chi quỹ', 'quỹ'], 10);
  const finalIndex = column(['lợi nhuận thực tế', 'lợi nhuận thực nhận', 'lợi nhuận thực'], 11);
  const body = headerIndex >= 0 ? matrix.slice(headerIndex + 1) : matrix.slice(1);
  return body.filter((row) => String(row?.[monthIndex] ?? '').trim()).map((raw) => {
    const revenue = numberValue(raw[revenueIndex]);
    const taxTndn = numberValue(raw[taxTndnIndex]);
    const taxVat = numberValue(raw[taxVatIndex]);
    const fuelQm = numberValue(raw[fuelQmIndex]);
    const fuelOut = numberValue(raw[fuelOutIndex]);
    const roadFee = numberValue(raw[tollIndex]);
    const wardFee = numberValue(raw[wardFeeIndex]);
    const calculatedGross = revenue - taxTndn - taxVat - fuelQm - roadFee - wardFee;
    const gross = grossIndex >= 0 ? numberValue(raw[grossIndex]) : calculatedGross;
    const payroll = payrollIndex >= 0 ? numberValue(raw[payrollIndex]) : 0;
    const bhxh = bhxhIndex >= 0 ? numberValue(raw[bhxhIndex]) : 0;
    const fund = fundIndex >= 0 ? numberValue(raw[fundIndex]) : 0;
    const final = finalIndex >= 0 ? numberValue(raw[finalIndex]) : gross - payroll - bhxh - fund - fuelOut;
    return {
      month: normalizeMonth(raw[monthIndex]),
      volume: numberValue(raw[volumeIndex]),
      revenue,
      operatingCost: revenue - gross,
      gross,
      cashCost: gross - final,
      final,
      taxTndn,
      taxVat,
      fuelQm,
      fuelOut,
      roadFee,
      wardFee,
      payroll,
      bhxh,
      fund,
      raw
    };
  }).filter((row) => row.month !== 'Tháng');
}

export function buildKpiMap(kpis?: DashboardKpi[]) {
  const map = new Map<string, DashboardKpi>();
  (kpis || []).forEach((item) => {
    const key = normalizeMonthLabel(item.month || item.monthKey);
    if (!key) return;
    const metrics = [item.revenue, item.operatingCost, item.gross, item.cashCost, item.final];
    if (!metrics.some((value) => value !== undefined && value !== null && Number.isFinite(Number(value)))) return;
    map.set(key, item);
  });
  return map;
}

export function metricValue(row: DashboardMonthRow, key: DashboardMetricKey, kpiMap: Map<string, DashboardKpi>) {
  const override = kpiMap.get(normalizeMonthLabel(row.month))?.[key];
  return override === undefined || override === null || !Number.isFinite(Number(override)) ? row[key] : Number(override);
}

export function aggregateDashboardPeriod(rows: DashboardMonthRow[], kpiMap: Map<string, DashboardKpi>, label: string): DashboardMonthRow | undefined {
  if (!rows.length) return undefined;
  return {
    month: label,
    volume: rows.reduce((sum, row) => sum + row.volume, 0),
    revenue: rows.reduce((sum, row) => sum + metricValue(row, 'revenue', kpiMap), 0),
    operatingCost: rows.reduce((sum, row) => sum + metricValue(row, 'operatingCost', kpiMap), 0),
    gross: rows.reduce((sum, row) => sum + metricValue(row, 'gross', kpiMap), 0),
    cashCost: rows.reduce((sum, row) => sum + metricValue(row, 'cashCost', kpiMap), 0),
    final: rows.reduce((sum, row) => sum + metricValue(row, 'final', kpiMap), 0),
    taxTndn: rows.reduce((sum, row) => sum + row.taxTndn, 0),
    taxVat: rows.reduce((sum, row) => sum + row.taxVat, 0),
    fuelQm: rows.reduce((sum, row) => sum + row.fuelQm, 0),
    fuelOut: rows.reduce((sum, row) => sum + row.fuelOut, 0),
    roadFee: rows.reduce((sum, row) => sum + row.roadFee, 0),
    wardFee: rows.reduce((sum, row) => sum + row.wardFee, 0),
    payroll: rows.reduce((sum, row) => sum + row.payroll, 0),
    bhxh: rows.reduce((sum, row) => sum + row.bhxh, 0),
    fund: rows.reduce((sum, row) => sum + row.fund, 0),
    raw: []
  };
}

export const DASHBOARD_OPERATING_START_MONTH = '05/2026';

export type ProfitChartTick = {
  value: number;
  positionPercent: number;
};

export type ProfitChartScale = {
  positiveMax: number;
  negativeMin: number;
  zeroPositionPercent: number;
  ticks: ProfitChartTick[];
  positionPercent: (value: number) => number;
};

export function buildProfitChartScale(values: number[], step = 500_000_000): ProfitChartScale {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 500_000_000;
  const finiteValues = values.map(Number).filter(Number.isFinite);
  const highest = Math.max(0, ...finiteValues);
  const lowest = Math.min(0, ...finiteValues);
  let positiveMax = highest > 0 ? Math.ceil(highest / safeStep) * safeStep : 0;
  const negativeMin = lowest < 0 ? -Math.ceil(Math.abs(lowest) / safeStep) * safeStep : 0;

  if (positiveMax === 0 && negativeMin === 0) positiveMax = safeStep;
  const span = positiveMax - negativeMin;
  const positionPercent = (value: number) => {
    const bounded = Math.min(positiveMax, Math.max(negativeMin, Number(value) || 0));
    return ((positiveMax - bounded) / span) * 100;
  };

  const ticks: ProfitChartTick[] = [];
  for (let value = positiveMax; value >= negativeMin; value -= safeStep) {
    ticks.push({ value, positionPercent: positionPercent(value) });
  }

  return {
    positiveMax,
    negativeMin,
    zeroPositionPercent: positionPercent(0),
    ticks,
    positionPercent
  };
}

export function profitChartMonthLabels(chartYear: string, operatingStartMonth = DASHBOARD_OPERATING_START_MONTH) {
  const year = Number(chartYear);
  const startMatch = normalizeMonth(operatingStartMonth).match(/^(\d{2})\/(20\d{2})$/);
  if (!Number.isInteger(year) || !startMatch) return [];
  const startMonth = Number(startMatch[1]);
  const startYear = Number(startMatch[2]);
  if (year < startYear) return [];
  const firstMonth = year === startYear ? startMonth : 1;
  return Array.from({ length: 13 - firstMonth }, (_, index) => `${String(firstMonth + index).padStart(2, '0')}/${year}`);
}

export function formatCurrencyText(value: number) {
  return Math.round(Number(value || 0)).toLocaleString('vi-VN');
}

export function normalizeVehiclePlate(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function countUniqueVehicles(trips: Array<{ vehicle?: unknown }> = []) {
  return new Set(trips.map((trip) => normalizeVehiclePlate(trip.vehicle)).filter(Boolean)).size;
}

export function growth(current: number, previous: number | undefined, invertGood = false) {
  if (previous === undefined || previous === 0) return { text: '-', statusClass: 'ok' as const };
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(percent)) return { text: '-', statusClass: 'ok' as const };
  const isGood = invertGood ? percent < 0 : percent >= 0;
  return {
    text: `${percent >= 0 ? '▲' : '▼'} ${Math.abs(percent).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`,
    statusClass: isGood ? 'ok' as const : 'err' as const
  };
}
