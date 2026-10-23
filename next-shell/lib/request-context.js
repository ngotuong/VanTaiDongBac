import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createAppUserRepository } from '../../server/repositories/app-user-repository.js';
import { createWorkbookContextRepository } from '../../server/repositories/workbook-context-repository.js';
import { runtimeConfig } from '../../server/runtime-config.js';
import { createAuthService } from '../../server/services/auth-service.js';
import { createWorkbookContextService } from '../../server/services/workbook-context-service.js';
import { selectedWorkbookYearFromCookie } from '../../server/services/workbook-year-cookie-service.js';
import { correlationIdFromHeaders } from './server-observability.js';

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

const loadAuthenticatedRequest = cache(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const config = runtimeConfig();
  const repository = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: repository, httpError });
  const user = await auth.getAuthenticatedUser({ headers: { cookie: cookieStore.toString() } }, config);
  return { user, headerStore, selectedYear: selectedWorkbookYearFromCookie(cookieStore.toString()), correlationId: correlationIdFromHeaders(headerStore) };
});

export async function loadPlatformContext(input = {}) {
  const { user, headerStore, selectedYear, correlationId } = await loadAuthenticatedRequest();
  const config = runtimeConfig();
  const workbookService = createWorkbookContextService({
    httpError,
    repository: createWorkbookContextRepository({ httpError }),
    config
  });
  const matchedPath = headerStore.get('x-matched-path') || headerStore.get('x-invoke-path') || '';
  const routeModule = /^\/cashflow(?:\/|$)/.test(matchedPath) ? 'cashflow' : input.module;
  const workbook = await workbookService.publicContextAsync({ module: routeModule, year: input.year || selectedYear });
  return { user, workbook, correlationId };
}

export async function loadServerWorkbookContext(input = {}) {
  const { headerStore, selectedYear } = await loadAuthenticatedRequest();
  const config = runtimeConfig();
  const workbookService = createWorkbookContextService({
    httpError,
    repository: createWorkbookContextRepository({ httpError }),
    config
  });
  const matchedPath = headerStore.get('x-matched-path') || headerStore.get('x-invoke-path') || '';
  const routeModule = /^\/cashflow(?:\/|$)/.test(matchedPath) ? 'cashflow' : input.module;
  return workbookService.resolveAsync({ module: routeModule, year: input.year || selectedYear });
}
