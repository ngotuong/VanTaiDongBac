import { NextResponse } from 'next/server';
import { PlatformApiError } from '../../lib/platform/api-contract';
import { loadManageData } from '../../lib/manage-server';
import { loadCatalogData } from '../../lib/catalog-server';
import { loadCashflowSurface } from '../../lib/cashflow-server';
import { loadPlatformContext } from '../../lib/request-context.js';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    if (query.get('surface') === 'cashflow') {
      const context = await loadPlatformContext({ module: 'cashflow', year: query.get('year') || undefined });
      if (query.get('view') === 'catalog' && context.user.role === 'shareholder') {
        throw Object.assign(new Error('Tài khoản cổ đông không có quyền đọc Danh mục Quỹ.'), { status: 403 });
      }
      const data = await loadCashflowSurface({ year: query.get('year'), surface: query.get('view'), month: query.get('month'), group: query.get('group'), startDate: query.get('startDate'), endDate: query.get('endDate'), search: query.get('search'), forceRefresh: query.get('forceRefresh') === 'true' });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (query.get('surface') === 'catalog') {
      const context = await loadPlatformContext({ module: 'transport' });
      if (context.user.role === 'shareholder') {
        throw Object.assign(new Error('Tài khoản cổ đông không có quyền đọc Danh mục Vận tải.'), { status: 403 });
      }
      const catalog = await loadCatalogData({ sheetName: query.get('sheetName'), forceRefresh: query.get('forceRefresh') === 'true' });
      return NextResponse.json(catalog, { headers: { 'Cache-Control': 'no-store' } });
    }
    await loadPlatformContext({ module: 'transport' });
    const data = await loadManageData({ sheetName: query.get('sheetName'), startDate: query.get('startDate'), endDate: query.get('endDate'), forceRefresh: query.get('forceRefresh') === 'true' });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof PlatformApiError ? error.status : Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Không tải được dữ liệu Vận hành.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
