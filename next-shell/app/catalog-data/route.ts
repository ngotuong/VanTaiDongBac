import { NextRequest, NextResponse } from 'next/server';
import { loadCatalogData } from '../../lib/catalog-server';
export async function GET(request:NextRequest){
  try{ const query=request.nextUrl.searchParams; return NextResponse.json(await loadCatalogData({sheetName:query.get('sheetName'),forceRefresh:query.get('forceRefresh')==='true'})); }
  catch(error){ const value=error as Error&{status?:number}; return NextResponse.json({error:value.message||'Không tải được Danh mục.'},{status:value.status||500}); }
}
