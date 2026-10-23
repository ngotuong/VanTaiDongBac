import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadDashboardData } from '../../lib/dashboard-server';
import { loadPlatformContext } from '../../lib/request-context.js';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await loadPlatformContext({ module: 'transport', year: url.searchParams.get('year') || undefined });
    const data = await loadDashboardData(url.searchParams.get('forceRefresh') === 'true', context.workbook.year);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Không tải được tổng quan.';
    return NextResponse.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
