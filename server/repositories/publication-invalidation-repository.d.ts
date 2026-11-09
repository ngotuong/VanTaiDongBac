import type { RuntimeConfig } from '../runtime-config.js';

export type PublicationInvalidationRow = {
  id: number | string;
  audience: 'preview' | 'production';
  workbook_year: string;
  report_month: string;
  generation_id: string;
  source_data_version: string;
  cache_version: string;
  published_at: string;
};

export function createPublicationInvalidationRepository(input: {
  fetchImpl?: typeof fetch;
  httpError: (status: number, message: string) => Error;
}): {
  findNext(config: RuntimeConfig, input: { year: string; afterId?: number }): Promise<PublicationInvalidationRow | null>;
};
