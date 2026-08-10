import 'server-only';

import { createReportBundleRepository } from '../../server/repositories/report-bundle-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { DashboardBundle, DashboardDataResponse } from './platform/dashboard-types';

const DASHBOARD_CACHE_KEY = '__dashboard_latest__';
function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }); }
function publicDashboard(value: DashboardBundle & { links?: unknown }): DashboardBundle {
  const dashboard = { ...value };
  delete dashboard.links;
  return dashboard;
}

export async function loadDashboardData(forceRefresh = false): Promise<DashboardDataResponse> {
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: 'transport' });
  if (!forceRefresh) {
    try {
      const config = runtimeConfig();
      if (config.supabaseUrl && config.serviceRoleKey) {
        const fetchWithTimeout: typeof fetch = (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) });
        const row = await createReportBundleRepository({ httpError, fetchImpl: fetchWithTimeout }).findLatest(config, DASHBOARD_CACHE_KEY, workbook.spreadsheetId);
        if (row?.payload && typeof row.payload === 'object') {
          return { dashboard: publicDashboard({ ...(row.payload as DashboardBundle), supabaseCached: true, supabaseSyncedAt: row.synced_at }) };
        }
      }
    } catch (error) {
      throw httpError(503, error instanceof Error ? error.message : 'Không đọc được Tổng quan từ Supabase.');
    }
    throw httpError(503, 'Cache Tổng quan trên Supabase chưa sẵn sàng.');
  }
  const api = await createServerApiClient();
  const dashboard = await api.get<DashboardBundle & { links?: unknown }>('getDashboard', {
    params: { forceRefresh: forceRefresh ? 'true' : '', spreadsheetId: workbook.spreadsheetId }
  });
  return { dashboard: publicDashboard(dashboard) };
}
