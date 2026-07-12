export type AppRole = 'admin' | 'operator' | 'shareholder';
export type WorkbookModule = 'transport' | 'cashflow';

export type RequestUser = {
  id: string;
  username: string;
  email: string;
  role: AppRole;
  displayName: string;
};

export type WorkbookContext = {
  module: WorkbookModule;
  year: string;
};

export type PlatformContext = {
  user: RequestUser;
  workbook: WorkbookContext;
  correlationId: string;
};

export type ApiRequestOptions = {
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
};
