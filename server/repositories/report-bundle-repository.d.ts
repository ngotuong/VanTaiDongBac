import type { RuntimeConfig } from '../runtime-config.js';
export type ReportBundleRow = { spreadsheet_id: string; report_month: string; payload: unknown; synced_at: string };
export function createReportBundleRepository(input: { fetchImpl?: typeof fetch; httpError: (status: number, message: string) => Error }): {
  findLatest(config: RuntimeConfig, month: string, spreadsheetId?: string): Promise<ReportBundleRow | null>;
  findMonths(config: RuntimeConfig, months: string[], spreadsheetId?: string): Promise<ReportBundleRow[]>;
};
