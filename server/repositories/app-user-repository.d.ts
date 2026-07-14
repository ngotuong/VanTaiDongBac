export function createAppUserRepository(input: {
  fetchImpl?: typeof fetch;
  httpError: (status: number, message: string) => Error;
}): {
  findActiveByUserId(config: unknown, userId: string): Promise<unknown>;
  findActiveByUserIdWithToken(config: unknown, userId: string, accessToken: string): Promise<unknown>;
};
