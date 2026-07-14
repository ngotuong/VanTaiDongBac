import { cookies } from 'next/headers';
import { runtimeConfig } from '../../../server/runtime-config.js';
import { createAppUserRepository } from '../../../server/repositories/app-user-repository.js';
import { createAuthService } from '../../../server/services/auth-service.js';
import { createWorkbookContextService } from '../../../server/services/workbook-context-service.js';

export const dynamic = 'force-dynamic';
function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const config = runtimeConfig();
  const repository = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: repository, httpError });
  await auth.getAuthenticatedUser({ headers: { cookie: cookieStore.toString() } }, config);
  const workbook = createWorkbookContextService({ httpError }).resolve({ module: url.searchParams.get('module') || 'transport', year: url.searchParams.get('year') || undefined });
  return Response.redirect(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(workbook.spreadsheetId)}/edit`, 307);
}
