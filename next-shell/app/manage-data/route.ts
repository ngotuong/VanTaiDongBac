import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadManageData } from '../../lib/manage-server';
import { loadCatalogData } from '../../lib/catalog-server';
import { loadCashflowSurface } from '../../lib/cashflow-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    if (query.get('surface') === 'cashflow') {
      const data = await loadCashflowSurface({ year: query.get('year'), surface: query.get('view'), month: query.get('month'), group: query.get('group'), forceRefresh: query.get('forceRefresh') === 'true' });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (query.get('surface') === 'catalog') {
      const catalog = await loadCatalogData({ sheetName: query.get('sheetName'), forceRefresh: query.get('forceRefresh') === 'true' });
      return NextResponse.json(catalog, { headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await loadManageData({ sheetName: query.get('sheetName'), startDate: query.get('startDate'), endDate: query.get('endDate'), forceRefresh: query.get('forceRefresh') === 'true' });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Không tải được dữ liệu Vận hành.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
