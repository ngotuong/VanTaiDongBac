import type { RequestUser } from '../../next-shell/lib/platform/types';

export function createAuthService(input: {
  fetchImpl?: typeof fetch;
  appUserRepository: unknown;
  httpError: (status: number, message: string) => Error;
}): {
  getAuthenticatedUser(request: { headers?: Record<string, string> }, config: unknown): Promise<RequestUser>;
};
