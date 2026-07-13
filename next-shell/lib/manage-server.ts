import 'server-only';

import { createManageBundleRepository } from '../../api/repositories/manage-bundle-repository.js';
import { runtimeConfig } from '../../api/runtime-config.js';
import { createWorkbookContextService } from '../../api/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { ManageBundle, ManageDataResponse, ManageRow, ManageSheetName } from './platform/manage-types';

export const MANAGE_SHEETS: ManageSheetName[] = ['NL_VanChuyen','NL_TaiXe','NL_Dau','NL_ChamCong','NL_Phat','NL_NghiVanHanh'];
const ISO_DATE = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }); }
function sheetName(value: unknown): ManageSheetName {
  const name = String(value || '').trim() as ManageSheetName;
  if (!MANAGE_SHEETS.includes(name)) throw httpError(400, 'Sheet Vận hành không hợp lệ.');
  return name;
}
function dateValue(value: unknown) {
  const date = String(value || '').trim();
  if (date && !ISO_DATE.test(date)) throw httpError(400, 'Ngày lọc Vận hành không hợp lệ.');
  return date;
}
function monthKeys(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) return [];
  const keys: string[] = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end && keys.length < 24) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}
function publicBundle(payload: unknown, syncedAt: string, monthly: boolean): ManageBundle | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Partial<ManageBundle> & { links?: unknown };
  if (!Array.isArray(value.headers) || !Array.isArray(value.rows)) return null;
  return { ...value, headers: value.headers.map(String), rows: value.rows as ManageRow[], supabaseCached: true, supabaseMonthlyCached: monthly, supabaseSyncedAt: syncedAt };
}
function rowDateKey(value: unknown) {
  const text = String(value || '').trim();
  if (/^20\d{2}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : '';
}
function filterDates(bundle: ManageBundle, startDate: string, endDate: string) {
  if (!startDate && !endDate) return bundle;
  const rows = bundle.rows.filter((row) => {
    const date = rowDateKey(row.values?.[0]);
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  }).slice(0, 500);
  return { ...bundle, rows, isLimited: Boolean(bundle.isLimited || bundle.rows.length >= 500) };
}
function combine(bundles: ManageBundle[]) {
  const first = bundles[0];
  const seen = new Set<string>();
  const rows = bundles.flatMap((bundle) => bundle.rows).filter((row) => {
    const key = `${row.rowIndex}|${JSON.stringify(row.values)}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).sort((left, right) => Number(right.rowIndex) - Number(left.rowIndex));
  return { ...first, rows, isLimited: bundles.some((bundle) => bundle.isLimited), supabaseCached: true, supabaseMonthlyCached: true };
}

export async function loadManageData(input: { sheetName?: unknown; startDate?: unknown; endDate?: unknown; forceRefresh?: boolean } = {}): Promise<ManageDataResponse> {
  const requestedSheet = sheetName(input.sheetName || MANAGE_SHEETS[0]);
  const startDate = dateValue(input.startDate); const endDate = dateValue(input.endDate);
  if (startDate && endDate && startDate > endDate) throw httpError(400, 'Ngày bắt đầu phải trước ngày kết thúc.');
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: 'transport' });
  if (!input.forceRefresh) {
    try {
      const config = runtimeConfig();
      const fetchWithTimeout: typeof fetch = (request, init = {}) => fetch(request, { ...init, signal: AbortSignal.timeout(5000) });
      const repository = createManageBundleRepository({ httpError, fetchImpl: fetchWithTimeout });
      const months = monthKeys(startDate, endDate);
      if (config.supabaseUrl && config.serviceRoleKey && months.length) {
        const rows = await Promise.all(months.map((month) => repository.find(config, requestedSheet, `month:${month}`)));
        const bundles = rows.map((row) => row && publicBundle(row.payload, row.synced_at, true));
        if (bundles.every(Boolean)) return { data: filterDates(combine(bundles as ManageBundle[]), startDate, endDate), sheetName: requestedSheet, startDate, endDate };
      } else if (config.supabaseUrl && config.serviceRoleKey) {
        const row = await repository.find(config, requestedSheet, 'recent_500');
        const bundle = row && publicBundle(row.payload, row.synced_at, false);
        if (bundle) return { data: filterDates(bundle, startDate, endDate), sheetName: requestedSheet, startDate, endDate };
      }
    } catch { /* Apps Script is the compatibility fallback. */ }
  }
  const api = await createServerApiClient();
  const data = await api.get<ManageBundle>('readManageData', { params: {
    sheetName: requestedSheet, startDate, endDate, limit: startDate || endDate ? '500' : '50',
    forceRefresh: input.forceRefresh ? 'true' : '', spreadsheetId: workbook.spreadsheetId
  } });
  if (data.ok === false) throw httpError(502, (data as ManageBundle & { error?: string }).error || 'Không đọc được dữ liệu Vận hành.');
  return { data, sheetName: requestedSheet, startDate, endDate };
}
