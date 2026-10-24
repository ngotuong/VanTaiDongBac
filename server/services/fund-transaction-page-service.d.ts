export type FundTransactionPageInput = {
  manifests?: Array<Record<string, any>>;
  pageBundles?: Array<Record<string, any>>;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  mode?: 'all' | 'debt';
  partner?: string;
};

export function createFundTransactionPageService(): {
  build(input?: FundTransactionPageInput): Record<string, unknown>;
  buildDirectPage(manifest: Record<string, unknown>, pageBundles: Array<Record<string, unknown>>, page?: number, pageSize?: number): Record<string, unknown>;
  isPagedManifest(payload: unknown): boolean;
};
