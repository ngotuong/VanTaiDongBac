export type CatalogSheetName = 'DM_NhanSu'|'DM_Xe'|'DM_DuAn'|'DM_CheDoLuong'|'DM_LuongChuyen'|'DM_ThamSo_TS'|'DM_GiaDau'|'DM_DonGiaVanChuyen'|'DM_ThuongQuanLy'|'DM_PhatNoiBo'|'DM_PhanCongXe'|'DM_UuDaiNoiBo';
export type CatalogRow = { rowIndex:number|string; values:unknown[] };
export type CatalogBundle = { ok?:boolean; error?:string; headers:string[]; editableHeaders?:string[]; fieldOptions?:Record<string,string[]>; rows:CatalogRow[]; isLimited?:boolean; sourceSheetName?:string; displaySheetName?:string; supabaseCached?:boolean; supabaseSyncedAt?:string };
export type CatalogDataResponse = { data:CatalogBundle; sheetName:CatalogSheetName };
