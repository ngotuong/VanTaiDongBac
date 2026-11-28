import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadDashboardData } from '../../lib/dashboard-server';
import { loadManageData } from '../../lib/manage-server';
import { aggregateDashboardTrips, dashboardTripRowDate, isDashboardTripDate } from '../../lib/platform/dashboard-trips';
import { loadPlatformContext } from '../../lib/request-context.js';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await loadPlatformContext({ module: 'transport', year: url.searchParams.get('year') || undefined });
    const date = url.searchParams.get('tripDate');
    if (date !== null) {
      const headers = { 'Cache-Control': 'no-store' };
      if (!isDashboardTripDate(date, String(context.workbook.year))) {
        return NextResponse.json({ error: 'Chọn một ngày hợp lệ trong năm đang xem.' }, { status: 400, headers });
      }
      const { data } = await loadManageData({
        sheetName: 'NL_VanChuyen', year: context.workbook.year, startDate: date, endDate: date, forceRefresh: true
      });
      if (!Array.isArray(data.rows) || data.isLimited || data.rows.length >= 500 ||
          data.rows.some((row) => dashboardTripRowDate(row.values?.[0]) !== date)) {
        return NextResponse.json({ error: 'Không thể xác nhận dữ liệu đầy đủ cho ngày này.' }, { status: 502, headers });
      }
      return NextResponse.json({ trips: aggregateDashboardTrips(data.rows, date) }, { headers });
    }
    const data = await loadDashboardData(url.searchParams.get('forceRefresh') === 'true', context.workbook.year);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Không tải được tổng quan.';
    return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
