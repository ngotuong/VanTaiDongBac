export function createFundBundleRepository(input: {
  fetchImpl?: typeof fetch;
  httpError: (status: number, message: string) => Error;
}): { find(config: { supabaseUrl: string; serviceRoleKey: string }, table: string, filters: Record<string, string>): Promise<{ payload: unknown; synced_at: string } | null> };
