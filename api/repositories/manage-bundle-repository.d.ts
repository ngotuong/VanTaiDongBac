import type { RuntimeConfig } from '../runtime-config.js';
export type ManageBundleRow = { sheet_name: string; filter_key: string; payload: unknown; synced_at: string };
export function createManageBundleRepository(input: { fetchImpl?: typeof fetch; httpError: (status: number, message: string) => Error }): {
  find(config: RuntimeConfig, sheetName: string, filterKey: string): Promise<ManageBundleRow | null>;
};
