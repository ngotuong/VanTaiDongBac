export function createFundBundleRepository(input: {
  fetchImpl?: typeof fetch;
  httpError: (status: number, message: string) => Error;
}): {
  find(config: { supabaseUrl: string; serviceRoleKey: string }, table: string, filters: Record<string, string>): Promise<{ payload: unknown; synced_at: string } | null>;
  findPages(config: { supabaseUrl: string; serviceRoleKey: string }, table: string, year: string, prefix: string): Promise<Array<{ filter_key: string; payload: unknown; synced_at: string }>>;
  upsert(config: { supabaseUrl: string; serviceRoleKey: string }, table: string, row: Record<string, unknown>, onConflict: string): Promise<Record<string, unknown>>;
};
