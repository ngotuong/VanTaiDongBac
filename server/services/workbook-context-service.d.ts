export type ResolvedWorkbookContext = {
  module: 'transport' | 'cashflow';
  year: string;
  spreadsheetId: string;
};

export function createWorkbookContextService(input: {
  env?: Record<string, string | undefined>;
  httpError: (status: number, message: string) => Error;
}): {
  resolve(value?: { module?: string; year?: string }): ResolvedWorkbookContext;
  publicContext(value?: { module?: string; year?: string }): Omit<ResolvedWorkbookContext, 'spreadsheetId'>;
};
