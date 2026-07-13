import 'server-only';

import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { createServerApiClient } from './platform/server-api-client';
import type { ReportBundle, ReportDataResponse } from './platform/report-types';

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
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: 'transport' });
  const api = await createServerApiClient();
  const bundle = await api.get<ReportBundle & { links?: unknown }>('getReportBundle', {
    params: {
      month: requestedMonth,
      forceRefresh: forceRefresh ? 'true' : '',
      spreadsheetId: workbook.spreadsheetId
    }
  });
  const publicBundle = { ...bundle };
  delete publicBundle.links;
  return { bundle: publicBundle, requestedMonth };
}
