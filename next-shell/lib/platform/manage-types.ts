import type { ReportCell } from './report-types';
export type ManageSheetName = 'NL_VanChuyen' | 'NL_TaiXe' | 'NL_Dau' | 'NL_ChamCong' | 'NL_Phat' | 'NL_NghiVanHanh' | 'NL_PhanCongLai' | 'NL_SoDuLuong';
export type ManageRow = { rowIndex: number; values: ReportCell[] };
export type ManageBundle = {
  ok?: boolean; headers: string[]; rows: ManageRow[]; isLimited?: boolean;
  supabaseCached?: boolean; supabaseMonthlyCached?: boolean; supabaseSyncedAt?: string;
};
export type ManageDataResponse = { data: ManageBundle; sheetName: ManageSheetName; startDate: string; endDate: string };
