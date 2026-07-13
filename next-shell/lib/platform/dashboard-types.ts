import type { ReportMatrix } from './report-types';
export type DashboardTrip = { project?: string; vehicle?: string; count?: number; ticket?: string };
export type DashboardBundle = {
  updatedAt?: string;
  overview?: { months?: ReportMatrix };
  latestTrips?: { date?: string; trips?: DashboardTrip[] };
  cached?: boolean;
  partial?: boolean;
  supabaseCached?: boolean;
  supabaseSyncedAt?: string;
};
export type DashboardDataResponse = { dashboard: DashboardBundle };
