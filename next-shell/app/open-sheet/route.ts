import { NextResponse } from 'next/server';
import { createWorkbookContextService } from '../../../server/services/workbook-context-service.js';
import { loadPlatformContext } from '../../lib/request-context.js';

export const dynamic = 'force-dynamic';

function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }); }

export async function GET() {
  try {
    const context = await loadPlatformContext();
    const workbook = createWorkbookContextService({ httpError }).resolve({ module: context.workbook.module, year: context.workbook.year });
    return NextResponse.redirect(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(workbook.spreadsheetId)}/edit`);
  } catch (error) {
    const failure = error as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: failure.message || 'Không thể mở Google Sheet.' }, { status: Number(failure.status) || 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
