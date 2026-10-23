import type { ReportMatrix } from './report-types';
export type DashboardTrip = { project?: string; vehicle?: string; count?: number; ticket?: string };
export type DashboardKpi = {
  month?: string;
  monthKey?: string;
  revenue?: number;
  gross?: number;
  operatingCost?: number;
  cashCost?: number;
  final?: number;
  fuelOut?: number;
  payroll?: number;
  bhxh?: number;
  fund?: number;
};
export type DashboardBundle = {
  updatedAt?: string;
  overview?: { months?: ReportMatrix; kpis?: DashboardKpi[] };
  latestTrips?: { date?: string; trips?: DashboardTrip[] };
  cached?: boolean;
  partial?: boolean;
  supabaseCached?: boolean;
  supabaseSyncedAt?: string;
};
export type DashboardDataResponse = { dashboard: DashboardBundle };
