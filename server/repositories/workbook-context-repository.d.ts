export type WorkbookContextRow = {
  year: string;
  transport_spreadsheet_id: string;
  cashflow_spreadsheet_id: string;
  lifecycle_status: 'draft' | 'ready' | 'active' | 'archived' | 'failed';
  source_year?: string | null;
  workbook_names?: Record<string, string> | null;
  audit_summary?: Record<string, unknown> | null;
  prepared_at?: string | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

export function createWorkbookContextRepository(input: {
  fetchImpl?: typeof fetch;
  httpError: (status: number, message: string) => Error;
}): {
  list(config: { supabaseUrl: string; serviceRoleKey: string; [key: string]: unknown }): Promise<WorkbookContextRow[]>;
};
