import 'server-only';

import { createReportBundleRepository } from '../../server/repositories/report-bundle-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { loadPlatformContext } from './request-context.js';
import { createServerApiClient } from './platform/server-api-client';
import { aggregateReportBundles, compareReportMonths, latestReportMonth, monthsWithinRange, reportDataMonths } from './platform/report-c2';
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

function normalizeExactMonth(value: unknown, label: string) {
  const month = normalizeMonth(value);
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(month)) throw httpError(400, `${label} không hợp lệ.`);
  return month;
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

export async function loadReportRangeData(fromInput: unknown, toInput: unknown, forceRefresh = false): Promise<ReportDataResponse> {
  const fromMonth = normalizeExactMonth(fromInput, 'Tháng bắt đầu');
  const toMonth = normalizeExactMonth(toInput, 'Tháng kết thúc');
  if (compareReportMonths(fromMonth, toMonth) > 0) throw httpError(400, 'Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.');
  if (forceRefresh) throw httpError(400, 'Đối soát trực tiếp Google Sheet chưa hỗ trợ cho khoảng tháng. Hãy làm mới dữ liệu tháng trước khi lọc khoảng.');

  await loadPlatformContext({ module: 'transport' });
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: 'transport' });
  const vehicleOwnersPromise = loadVehicleOwners().catch(() => ({}));
  try {
    const config = runtimeConfig();
    if (!config.supabaseUrl || !config.serviceRoleKey) throw httpError(503, 'Cache Báo cáo trên Supabase chưa sẵn sàng.');
    const fetchWithTimeout: typeof fetch = (request, init = {}) => fetch(request, { ...init, signal: AbortSignal.timeout(5000) });
    const repository = createReportBundleRepository({ httpError, fetchImpl: fetchWithTimeout });
    const referenceRow = await repository.findLatest(config, toMonth, workbook.spreadsheetId);
    if (!referenceRow?.payload) throw httpError(503, `Chưa có cache Báo cáo tháng ${toMonth}.`);

    const availableMonths = reportDataMonths((referenceRow.payload as ReportBundle).overview?.months);
    const includedMonths = monthsWithinRange(availableMonths, fromMonth, toMonth);
    if (!includedMonths.length || includedMonths[0] !== fromMonth || includedMonths.at(-1) !== toMonth) {
      throw httpError(400, 'Khoảng tháng đã chọn không nằm trọn trong dữ liệu Báo cáo hiện có.');
    }

    const rows = await repository.findMonths(config, includedMonths, workbook.spreadsheetId);
    const rowsByMonth = new Map(rows.map((row) => [row.report_month, row]));
    const missingMonths = includedMonths.filter((month) => !rowsByMonth.get(month)?.payload);
    if (missingMonths.length) throw httpError(503, `Thiếu cache Báo cáo cho tháng: ${missingMonths.join(', ')}.`);
    const orderedRows = includedMonths.map((month) => rowsByMonth.get(month)!);
    const bundle = aggregateReportBundles(orderedRows.map((row) => row.payload as ReportBundle), includedMonths);
    const syncedAt = orderedRows.map((row) => row.synced_at).filter(Boolean).sort().at(-1);
    return {
      bundle: publicBundle({ ...bundle, apiCached: true, supabaseCached: true, supabaseSyncedAt: syncedAt }),
      requestedMonth: `${fromMonth}–${toMonth}`,
      fromMonth,
      toMonth,
      includedMonths,
      vehicleOwners: await vehicleOwnersPromise
    };
  } catch (error) {
    if (Number((error as { status?: number })?.status)) throw error;
    throw httpError(503, error instanceof Error ? error.message : 'Không đọc được Báo cáo theo khoảng tháng từ Supabase.');
  }
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
