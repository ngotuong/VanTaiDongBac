export type ReportCell = string | number | boolean | null;
export type ReportMatrix = ReportCell[][];

export type ReportBundle = {
  ok?: boolean;
  month?: string;
  apiCached?: boolean;
  supabaseCached?: boolean;
  supabaseSyncedAt?: string;
  updatedAt?: string;
  overview?: {
    months?: ReportMatrix;
    details?: ReportMatrix;
  };
  payroll?: ReportMatrix;
  vehicles?: ReportMatrix;
};

export type ReportDataResponse = {
  bundle: ReportBundle;
  requestedMonth: string;
  vehicleOwners?: Record<string, string>;
};
