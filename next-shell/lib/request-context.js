import 'server-only';

import { cookies, headers } from 'next/headers';
import { createAppUserRepository } from '../../api/repositories/app-user-repository.js';
import { runtimeConfig } from '../../api/runtime-config.js';
import { createAuthService } from '../../api/services/auth-service.js';
import { createWorkbookContextService } from '../../api/services/workbook-context-service.js';
import { correlationIdFromHeaders } from './server-observability.js';

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export async function loadPlatformContext(input = {}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const config = runtimeConfig();
  const repository = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: repository, httpError });
  const workbookService = createWorkbookContextService({ httpError });
  const user = await auth.getAuthenticatedUser({ headers: { cookie: cookieStore.toString() } }, config);
  const workbook = workbookService.publicContext({ module: input.module, year: input.year });
  return { user, workbook, correlationId: correlationIdFromHeaders(headerStore) };
}
