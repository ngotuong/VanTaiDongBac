import 'server-only';

import { createReportBundleRepository } from '../../server/repositories/report-bundle-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { loadPlatformContext } from './request-context.js';
import { createServerApiClient } from './platform/server-api-client';
import { latestReportMonth } from './platform/report-c2';
import type { ReportBundle, ReportDataResponse } from './platform/report-types';
import { loadCatalogData } from './catalog-server';

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function normalizeMonth(value: unknown) {
  const month = String(value || '').trim() || 'latest';
  if (month === 'latest' || month === 'Tất cả' || /^(0?[1-9]|1[0-2])\/20\d{2}$/.test(month)) return month;
  throw httpError(400, 'Tháng báo cáo không hợp lệ.');
}

export async function loadReportData(monthInput: unknown = 'latest', forceRefresh = false): Promise<ReportDataResponse> {
  const requestedMonth = normalizeMonth(monthInput);
  await loadPlatformContext({ module: 'transport' });
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: 'transport' });
  const vehicleOwnersPromise = loadVehicleOwners().catch(() => ({}));
  let apiMonth = requestedMonth;
  if (!forceRefresh) {
    try {
      const config = runtimeConfig();
      if (config.supabaseUrl && config.serviceRoleKey) {
        const fetchWithTimeout: typeof fetch = (request, init = {}) => fetch(request, { ...init, signal: AbortSignal.timeout(5000) });
        const repository = createReportBundleRepository({ httpError, fetchImpl: fetchWithTimeout });
        let row = await repository.findLatest(config, requestedMonth, workbook.spreadsheetId);
        if (requestedMonth === 'latest' && row?.payload) {
          const resolvedMonth = latestReportMonth((row.payload as ReportBundle).overview?.months);
          if (!resolvedMonth) {
            row = null;
          } else if (row.report_month !== resolvedMonth) {
            apiMonth = resolvedMonth;
            row = await repository.findLatest(config, resolvedMonth, workbook.spreadsheetId);
          }
        }
        if (row?.payload) return { bundle: publicBundle({ ...(row.payload as ReportBundle), apiCached: true, supabaseCached: true, supabaseSyncedAt: row.synced_at }), requestedMonth, vehicleOwners: await vehicleOwnersPromise };
      }
    } catch (error) {
      throw httpError(503, error instanceof Error ? error.message : 'Không đọc được Báo cáo từ Supabase.');
    }
    throw httpError(503, 'Cache Báo cáo trên Supabase chưa sẵn sàng.');
  }
  const api = await createServerApiClient();
  const bundle = await api.get<ReportBundle & { links?: unknown }>('getReportBundle', {
    params: {
      month: apiMonth,
      forceRefresh: forceRefresh ? 'true' : '',
      spreadsheetId: workbook.spreadsheetId
    }
  });
  return { bundle: publicBundle(bundle), requestedMonth, vehicleOwners: await vehicleOwnersPromise };
}

async function loadVehicleOwners() {
  const { data } = await loadCatalogData({ sheetName: 'DM_Xe' });
  const normalizedHeaders = data.headers.map((header) => header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'));
  const plateIndex = normalizedHeaders.findIndex((header) => header.includes('bien so xe'));
  const ownerIndex = normalizedHeaders.findIndex((header) => header.includes('cong ty so huu'));
  if (plateIndex < 0 || ownerIndex < 0) return {};
  return Object.fromEntries(data.rows.map((row) => [String(row.values[plateIndex] || ''), String(row.values[ownerIndex] || '')]).filter(([plate, owner]) => plate && owner));
}

function publicBundle(bundle: ReportBundle & { links?: unknown }) {
  const value = { ...bundle };
  delete value.links;
  return value;
}
