export function createFundRangeService(): {
  buildOverviewRange(payload: Record<string, unknown> | Array<Record<string, unknown>>, startDate: string, endDate: string): Record<string, unknown>;
  buildLoansRange(payload: Record<string, unknown>, startDate: string, endDate: string): Record<string, unknown>;
  mergeTransactionBundles(payloads: Array<Record<string, unknown>>, startDate: string, endDate: string): Record<string, unknown>;
  monthKeys(startDate: string, endDate: string): string[];
  contiguousCachedRows<T>(rows: Array<T | null | undefined>, requestedMonthKeys: string[]): T[];
};
