import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadManageData } from '../../lib/manage-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const data = await loadManageData({ sheetName: query.get('sheetName'), startDate: query.get('startDate'), endDate: query.get('endDate'), forceRefresh: query.get('forceRefresh') === 'true' });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Không tải được dữ liệu Vận hành.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
