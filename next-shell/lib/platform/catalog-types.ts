export type CatalogSheetName = 'DM_NhanSu'|'DM_Xe'|'DM_DuAn'|'DM_LuongChuyen'|'DM_ThamSo_TS'|'DM_ThamSo_GD'|'DM_DonGiaVanChuyen'|'DM_ThuongQuanLy'|'DM_PhatNoiBo';
export type CatalogRow = { rowIndex:number|string; values:unknown[] };
export type CatalogBundle = { ok?:boolean; error?:string; headers:string[]; rows:CatalogRow[]; isLimited?:boolean; sourceSheetName?:string; displaySheetName?:string; supabaseCached?:boolean; supabaseSyncedAt?:string };
export type CatalogDataResponse = { data:CatalogBundle; sheetName:CatalogSheetName };
