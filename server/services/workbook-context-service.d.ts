export type ResolvedWorkbookContext = {
  module: 'transport' | 'cashflow';
  year: string;
  spreadsheetId: string;
  activeYear: string;
  availableYears: string[];
  readOnly: boolean;
};

export function createWorkbookContextService(input: {
  env?: Record<string, string | undefined>;
  repository?: { list(config: { supabaseUrl?: string; serviceRoleKey?: string; [key: string]: unknown }, options?: Record<string, unknown>): Promise<Array<Record<string, unknown>>> } | null;
  config?: { supabaseUrl?: string; serviceRoleKey?: string; [key: string]: unknown } | null;
  httpError: (status: number, message: string) => Error;
}): {
  resolve(value?: { module?: string; year?: string }): ResolvedWorkbookContext;
  resolveAsync(value?: { module?: string; year?: string }, options?: Record<string, unknown>): Promise<ResolvedWorkbookContext>;
  publicContext(value?: { module?: string; year?: string }): Omit<ResolvedWorkbookContext, 'spreadsheetId'>;
  publicContextAsync(value?: { module?: string; year?: string }, options?: Record<string, unknown>): Promise<Omit<ResolvedWorkbookContext, 'spreadsheetId'>>;
  assertWritable(value?: { module?: string; year?: string }): ResolvedWorkbookContext;
  assertWritableAsync(value?: { module?: string; year?: string }, options?: Record<string, unknown>): Promise<ResolvedWorkbookContext>;
};
