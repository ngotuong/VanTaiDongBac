import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadReportData, loadReportRangeData } from '../../lib/report-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const fromMonth = url.searchParams.get('fromMonth');
    const toMonth = url.searchParams.get('toMonth');
    const forceRefresh = url.searchParams.get('forceRefresh') === 'true';
    const year = url.searchParams.get('year') || undefined;
    const data = fromMonth || toMonth
      ? await loadReportRangeData(fromMonth, toMonth, forceRefresh, year)
      : await loadReportData(url.searchParams.get('month'), forceRefresh, year);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Không tải được báo cáo.';
    return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
