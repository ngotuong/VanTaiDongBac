# PROJECT_SCHEMA

Tai lieu nay tong hop hien trang du an Web App VanTaiDongBac 2026 va cac file Google Sheet lien quan.

Pham vi thuc hien:
- Chi tao tai lieu, chua sua code chuc nang.
- Khong thay doi cau truc Google Sheet.
- Khong chay `clasp push`.
- Khong `git push`.

Nguon da doc:
- `AGENTS.md`
- `APP_ARCHITECTURE.md`
- `docs/schema/van_tai_2026_schema_raw_20260625_175704.json`
- `docs/schema/thu_chi_2026_schema_raw_20260625_175010.json`
- `docs/source/thu_chi_bound_script/`

Luu y ve duong dan:
- File `docs/schema/van_tai_2026_schema_raw.json` khong ton tai trong repo hien tai. File thuc te co hau to timestamp la `docs/schema/van_tai_2026_schema_raw_20260625_175704.json`.
- File `docs/schema/thu_chi_2026_schema_raw.json` khong ton tai trong repo hien tai. File thuc te co hau to timestamp la `docs/schema/thu_chi_2026_schema_raw_20260625_175010.json`.
- Thu muc `docs/source/thu_chi_bound_script/Button/` khong ton tai trong repo hien tai. Apps Script di kem file Thu chi hien nam truc tiep trong `docs/source/thu_chi_bound_script/`.

## 1. Nguyen tac kien truc bat buoc

Theo `AGENTS.md` va `APP_ARCHITECTURE.md`:

- Web app la Apps Script doc lap trong My projects tai `script.google.com`.
- Web app khong gan co dinh voi mot Google Sheet cu the.
- Khong copy code web app vao tung Google Sheet theo nam.
- Khong gia dinh `SpreadsheetApp.getActiveSpreadsheet()` la file du lieu chinh cua web app.
- Khi doc/ghi du lieu chinh, uu tien `SpreadsheetApp.openById(id)`.
- Neu can doi cau truc Google Sheet, phai viet ham migration rieng, khong sua truc tiep.
- Khong tu y doi ten sheet.
- Khong tu y doi thu tu cot.
- Khong xoa cong thuc trong Google Sheet.
- Khong gop du lieu file Van tai va file Thu chi neu chua duoc yeu cau.

He thong co 2 module nghiep vu chinh:

1. Module Van tai
   - Du lieu nam trong Google Sheet Van tai theo tung nam.
   - Moi nam co the co mot file Van tai rieng.

2. Module Thu chi
   - Du lieu nam trong Google Sheet Thu chi theo tung nam.
   - Thu chi can la mot menu/module rieng cua web app.
   - Khong hieu Thu chi chi la nguon import du lieu cho Van tai.
   - Mot so lien ket giua Thu chi va Van tai dang duoc xu ly bang cong thuc trong Google Sheet.

## 2. Kien truc hien tai cua web app

Web app hien tai gom phan backend Apps Script va frontend HTML/CSS/JS.

Backend:

- `AppConfig.gs`
  - Quan ly cau hinh spreadsheet active.
  - Ho tro lay spreadsheet id tu request param/body hoac Script Properties.
  - Cac key Script Properties dang duoc ho tro:
    - `ACTIVE_SPREADSHEET_ID`
    - `DEFAULT_SPREADSHEET_ID`
    - `SPREADSHEET_ID_<year>`
  - Spreadsheet mac dinh hien tai la file Van tai 2026.

- `Router.gs`
  - Cung cap `doGet`, `doPost`.
  - Render `index.html`.
  - Dinh tuyen API theo `action`.

- `PublicApi.gs`
  - Lop public wrapper cho cac ham service.
  - Giu API surface gon hon cho frontend/goi HTTP.

- `SheetService.gs`
  - Lop nghiep vu chinh hien tai cua module Van tai.
  - Doc danh muc, dashboard, bao cao.
  - Ghi du lieu nhap lieu vao cac sheet `NL_*`.
  - CRUD cho cac sheet quan ly/danh muc.
  - Cache du lieu bang `CacheService`, `ScriptProperties`, va sheet an `SYS_ReportCache`.

- `ValidationService.gs`
  - Build va validate row truoc khi ghi vao Google Sheet.
  - Chuyen doi ngay/so.
  - Dinh nghia builder cho tung loai form nhap lieu.

Frontend:

- `index.html`
  - Ban build/tong hop dung cho web app/static hosting.
  - Chua UI hien tai cua toan bo web app.

- `client_*.html`
  - Cac module JS nguon cua frontend.
  - Dang tach logic theo khu vuc: config, API, dashboard, nhap lieu, bao cao, quan ly, danh muc, UI.

- `styles_*.html`
  - Cac module CSS nguon.
  - Da tach mot phan theo base/layout/dashboard/entry/reports/responsive/settings.

Kien truc du lieu hien tai:

- Web app hien dang doc/ghi truc tiep file Van tai thong qua Spreadsheet ID.
- File Thu chi dang lien ket sang file Van tai qua sheet `IMP_ThuChi` bang cong thuc `IMPORTRANGE`.
- Module Thu chi chua ro da duoc tich hop thanh menu rieng trong web app chinh hay chua. Chua ro, can xac nhan.

## 3. API route hien co

`Router.gs` dinh tuyen cac action GET:

- `debugSheet`
- `getBootstrap`
- `getInitialData`
- `getCatalogs`
- `getDashboard`
- `getReports`
- `getReport`
- `getReportBundle`
- `invalidateCaches`
- `readSheetData`

`Router.gs` dinh tuyen cac action POST:

- `submitRows`
- `checkTripReconciliation`
- `saveSheetRow`
- `deleteSheetRow`

## 4. Menu/chuc nang hien co cua web app

Menu dieu huong chinh tu `client_config.html`:

- `home`: Tong quan / KPI & Bieu do
- `entry`: Nhap lieu / Bieu mau NL
- `reports`: Bao cao / Bang chi tiet
- `manage`: Quan ly / Nhat ky nhap lieu
- `catalog`: Danh muc / Danh muc he thong
- `settings`: Huong dan / Cai dat App

Form nhap lieu:

- `vanChuyen`: Van chuyen
- `taiXe`: Tai xe
- `dau`: Dau le
- `chamCong`: Cham cong
- `phat`: Phat noi bo
- `nghiVanHanh`: Nghi van hanh

Tab bao cao:

- Tat ca bao cao
- Bao cao tong quan
- Bao cao chi tiet
- Luong nhan su
- Tong hop xe

Tab quan ly nhap lieu:

- `NL_Dau`: Dau le
- `NL_VanChuyen`: Van chuyen
- `NL_TaiXe`: Chi tiet tai xe
- `NL_ChamCong`: Cham cong
- `NL_Phat`: Phat noi bo
- `NL_NghiVanHanh`: Nghi van hanh

Bo loc rieng cua `NL_Dau`:

- Nguon dau: Tat ca nguon, Quang Minh, Do ngoai
- Nguon chi: Tat ca nguon chi, Quang Quan, Minh Vuong, Quy/Chi quy

Tab danh muc:

- `DM_NhanSu`
- `DM_Xe`
- `DM_DuAn`
- `DM_PhanCongLaiXe`
- `DM_LuongChuyen`
- `DM_ThamSo_TS` - tab ao tren frontend, doc/ghi mot phan `DM_ThamSo`
- `DM_ThamSo_GD` - tab ao tren frontend, doc/ghi mot phan `DM_ThamSo`
- `DM_DonGiaVanChuyen`
- `DM_ThuongQuanLy`
- `DM_PhatNoiBo`

Menu Thu chi rieng trong web app chinh:

- Chua ro, can xac nhan.
- Theo yeu cau kien truc, Thu chi can duoc dua vao web app nhu mot menu/module rieng.
- Hien tai repo moi thay Apps Script bound voi file Thu chi trong `docs/source/thu_chi_bound_script/`, chua thay module Thu chi hoan chinh trong frontend web app doc lap.

## 5. Ham chinh trong web app

### `AppConfig.gs`

- `activate`
- `activateFromEvent`
- `buildConfig_`
- `resolveSpreadsheetId_`
- `clean_`

Chuc nang chinh:
- Xac dinh spreadsheet active theo request, nam, hoac Script Properties.
- Dang duoc thiet ke de web app khong bi gan co dinh vao mot file Google Sheet.

### `Router.gs`

- `doGet`
- `doPost`
- `jsonResponse_`
- `renderIndex_`
- `include`

Chuc nang chinh:
- Render giao dien.
- Dinh tuyen API GET/POST.

### `PublicApi.gs`

- `getInitialData`
- `getBootstrap`
- `getCatalogs`
- `getDashboard`
- `getReports`
- `getReport`
- `getReportBundle`
- `invalidateCaches`
- `submitRows`
- `checkTripReconciliation`
- `readSheetData`
- `saveSheetRow`
- `deleteSheetRow`

Chuc nang chinh:
- Tao lop public API goi xuong `SheetService.gs`.

### `SheetService.gs`

Ham public/main:

- `getBootstrap`
- `getInitialData`
- `getCatalogs`
- `getDashboard`
- `getReports`
- `getReport`
- `getReportBundle`
- `invalidateCaches`
- `submitRows`
- `checkTripReconciliation`
- `readSheetData`
- `saveSheetRow`
- `deleteSheetRow`

Ham helper quan trong:

- `readCatalogs_`
- `readParams_`
- `readOverviewReport_`
- `readOverviewDashboard_`
- `readOverviewDetailsWithCache_`
- `computeAndCacheOverviewDetails_`
- `getReportCacheSheet_`
- `readReportTables_`
- `readLatestTrips_`
- `applyFormatsSafely_`
- `getLastNonEmptyRowInColumn_`

Chuc nang chinh:
- Doc danh muc, dashboard, bao cao Van tai.
- Ghi du lieu nhap lieu vao sheet `NL_*`.
- CRUD cho cac sheet quan ly/danh muc.
- Cache report de tang toc do.

### `ValidationService.gs`

- `buildRows`
- `parseDate`
- `parseNumber`
- Cac builder cho:
  - `vanChuyen`
  - `taiXe`
  - `dau`
  - `chamCong`
  - `phat`
  - `nghiVanHanh`

Chuc nang chinh:
- Chuan hoa input frontend thanh row dung schema sheet.
- Validate du lieu truoc khi ghi.

### Frontend `client_*.html`

- `client_config.html`
  - Dinh nghia nav, form schemas, state, helper autocomplete/date.

- `client_api.html`
  - Goi API backend.
  - Quan ly backend URL va cache phien frontend.

- `client_app.html`
  - Khoi tao app, dieu huong view, export anh.

- `client_dashboard.html`
  - Render KPI, chart, quick actions, latest trips.

- `client_entry.html`
  - Render form nhap lieu, them dong, submit, hien lich su gan day.

- `client_reports.html`
  - Render bao cao, tab, table card, subtotal, filter thang.

- `client_manage.html`
  - Quan ly CRUD du lieu nhap lieu, filter, modal.

- `client_catalog.html`
  - Quan ly CRUD danh muc, filter.

- `client_data.html`
  - Load dashboard, catalog, report bundle, submit data.

- `client_ui.html`
  - Status, drawer, settings, binding UI event.

## 6. Mapping ham web app doc/ghi sheet

| Ham | Doc sheet | Ghi sheet | Ghi chu |
| --- | --- | --- | --- |
| `getCatalogs` / `readCatalogs_` | `DM_Xe`, `DM_NhanSu`, `DM_DuAn`, `DM_PhatNoiBo`, `DM_PhanCongLaiXe`, `DM_ThamSo` | Khong | Doc danh muc cho form va UI. |
| `getDashboard` | `BC_TongQuan`, `NL_VanChuyen`, co the doc cache | Khong | Doc KPI, bieu do, chuyen gan day. |
| `getReports` | `BC_TongQuan`, `BC_BangLuong`, `BC_TongHopXe`, `NL_VanChuyen`, co the doc cache | Khong | Doc cac report tong hop. |
| `getReport` | Tuy type: `BC_TongQuan`, `BC_BangLuong`, `BC_TongHopXe` | Khong | Doc tung report. |
| `getReportBundle` | `BC_TongQuan`, `BC_BangLuong`, `BC_TongHopXe`, `SYS_ReportCache` | Co the ghi `SYS_ReportCache`, co the cap nhat tam `BC_TongQuan!B1` | Dung de gom report theo thang va cache. |
| `readOverviewDetailsWithCache_` | `BC_TongQuan`, `SYS_ReportCache` | `SYS_ReportCache`, co the cap nhat tam `BC_TongQuan!B1` | Dung B1 lam controller thang cho report chi tiet. |
| `submitRows` | Co the doc metadata/cau hinh sheet | `NL_VanChuyen`, `NL_TaiXe`, `NL_Dau`, `NL_ChamCong`, `NL_Phat`, `NL_NghiVanHanh` | Ghi theo `formType`. |
| `checkTripReconciliation` | `NL_VanChuyen`, `NL_TaiXe` | Khong | Doi soat so chuyen. |
| `readSheetData` | Sheet duoc yeu cau, gom `NL_*`, `DM_*`; `DM_ThamSo_TS/GD` la tab ao | Khong | Dung cho Quan ly/Danh muc. |
| `saveSheetRow` | Sheet duoc yeu cau | Sheet duoc yeu cau | CRUD add/update, co logic giu cot cong thuc. |
| `deleteSheetRow` | Sheet duoc yeu cau | Sheet duoc yeu cau | Xoa dong hoac clear cot. |
| `invalidateCaches` | Khong ro sheet truc tiep | ScriptProperties/CacheService | Tang data version va xoa cache; khong phai ghi du lieu nghiep vu. |

Mapping `submitRows(formType)`:

| `formType` | Sheet ghi |
| --- | --- |
| `vanChuyen` | `NL_VanChuyen` |
| `taiXe` | `NL_TaiXe` |
| `dau` | `NL_Dau` |
| `chamCong` | `NL_ChamCong` |
| `phat` | `NL_Phat` |
| `nghiVanHanh` | `NL_NghiVanHanh` |

## 7. Cau truc Google Sheet Van tai

Thong tin file:

- Ten spreadsheet: `VanTaiDongBac_2026`
- Spreadsheet ID: `1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA`
- Timezone: `Asia/Saigon`
- Locale: `vi_VN`
- Exported: `2026-06-25T10:55:43.367Z`
- Named ranges: 0

Danh sach sheet:

| Sheet | Vai tro | Ghi chu chinh |
| --- | --- | --- |
| `NL_VanChuyen` | Nhap lieu van chuyen | Du lieu chuyen theo ngay/xe/du an/so chuyen/so phieu. |
| `NL_TaiXe` | Nhap lieu tai xe | Ngay, thang, xe, tai xe, so chuyen, ghi chu. |
| `NL_Dau` | Nhap lieu dau | Ngay, thang, xe, nguon dau, so lit, gia dau, thanh tien, ghi chu. |
| `NL_ChamCong` | Nhap cham cong | Tu ngay, den ngay, nhan su, loai ngay cong, so ngay, nhom xu ly. |
| `NL_Phat` | Nhap phat noi bo | Ngay, nhan su, ma phat, noi dung, so tien. |
| `NL_NghiVanHanh` | Nhap nghi van hanh | Ngay, xe, du an, loai nghi, so gio, tinh KPI/giam KPI. |
| `XL_DoiSoatChuyen` | Xu ly doi soat chuyen | Cong thuc so sanh bao cao van chuyen va tai xe. |
| `XL_VanChuyen` | Xu ly doanh thu van chuyen | Tinh khoi luong, km, gia dau, don gia, doanh thu. |
| `XL_LuongTheoXe` | Xu ly luong theo xe | Tong hop chuyen, KPI, luong chuyen. |
| `XL_LuongNhanSu` | Xu ly luong nhan su | Tinh luong nhan su theo thang. |
| `XL_NgoaiLe` | Xu ly ngoai le | Phat hien truong hop thieu/du/ngoai le lien quan tai xe, phan cong. |
| `XL_ThuongQuanLy` | Xu ly thuong quan ly | Tinh thuong quan ly/tuyen dung/moc tai xe. |
| `BC_TongQuan` | Bao cao tong quan | Nguon dashboard, KPI, chi tiet theo thang. |
| `BC_BangLuong` | Bao cao bang luong | Bao cao luong nhan su. |
| `BC_TongHopXe` | Bao cao tong hop xe | Tong hop hieu qua theo xe. |
| `DM_DuAn` | Danh muc du an | Ten du an, km, hieu luc. |
| `DM_Xe` | Danh muc xe | Bien so, khoi luong, loai xe, trang thai, cong ty so huu. |
| `DM_NhanSu` | Danh muc nhan su | Nhan su, chuc vu, luong, trang thai, loai luong. |
| `DM_PhanCongLaiXe` | Danh muc phan cong lai xe | Xe, tai xe, vai tro, thoi gian hieu luc. |
| `DM_LuongChuyen` | Danh muc luong chuyen | Moc chuyen va don gia/chuyen. |
| `DM_ThamSo` | Tham so he thong | Tham so chung va lich su gia dau. |
| `DM_DonGiaVanChuyen` | Don gia van chuyen | Don gia theo du an va moc chuyen. |
| `DM_ThuongQuanLy` | Cau hinh thuong quan ly | Ma thuong, dieu kien, so tien, hieu luc. |
| `DM_PhatNoiBo` | Cau hinh phat noi bo | Ma phat, noi dung, so tien, hieu luc. |
| `IMP_ThuChi` | Import tu file Thu chi | Dung `IMPORTRANGE` va cong thuc phan loai. |
| `SYS_ReportCache` | Cache an | Cache chi tiet report cua web app. |

### Sheet nhap lieu Van tai

`NL_VanChuyen`:

- Cot nghiep vu du kien: Ngay, Thang, Bien so xe, Du an, So chuyen, So phieu, Ghi chu.
- Cong thuc quan trong:
  - Subtotal so chuyen.
  - Cot thang duoc tao tu cot ngay bang `ARRAYFORMULA`.
- Header trong raw export co mot so o trong/khong doc ro. Chua ro, can xac nhan.

`NL_TaiXe`:

- Cot: Ngay, Thang, Bien so xe, Tai xe, So chuyen, Ghi chu.
- Cong thuc quan trong:
  - Cot thang duoc tao tu cot ngay bang `ARRAYFORMULA`.

`NL_Dau`:

- Cot nghiep vu du kien: Ngay, Thang, Bien so xe, Nguon dau, So lit, Gia dau, Thanh tien, Ghi chu.
- Cong thuc quan trong:
  - Cot thang duoc tao tu cot ngay bang `ARRAYFORMULA`.
  - Thanh tien = So lit * Gia dau.
  - Co subtotal o dong dau.
- Co mot so o so lit dang chua cong thuc cong tay nhu `=120+340+160`. Can can than khi ghi/format de khong pha cong thuc nguoi dung.

`NL_ChamCong`:

- Cot: Tu ngay, Den ngay, Thang, Nhan su, Loai ngay cong, So ngay, Tinh luong cung, Nhom xu ly, Ghi chu, Loai ngay cong hop le, Luu y.
- Cong thuc quan trong:
  - Thang lay tu ngay bat dau.
  - So ngay tinh theo khoang tu ngay/den ngay.
  - Cot tinh luong cung va nhom xu ly suy ra tu loai ngay cong.

`NL_Phat`:

- Cot: Ngay, Thang, Nhan su, Ma phat, Noi dung phat, So tien phat, Ghi chu.
- Cong thuc quan trong:
  - Thang lay tu ngay.
  - Noi dung va so tien phat lookup tu `DM_PhatNoiBo`.

`NL_NghiVanHanh`:

- Cot: Ngay, Thang, Bien so xe, Du an, Loai nghi, So gio nghi, Tinh KPI?, Giam KPI, Ghi chu.
- Cong thuc quan trong:
  - Thang lay tu ngay.
  - `Tinh KPI?` suy ra theo loai nghi.
  - `Giam KPI` tinh theo so gio va tham so KPI.
- Dropdown/validation:
  - Co validation `VALUE_IN_RANGE` cho cot xe/du an.

### Sheet xu ly Van tai

`XL_DoiSoatChuyen`:

- Protected sheet.
- Doc `NL_VanChuyen` va `NL_TaiXe`.
- So sanh so chuyen bao cao va so chuyen tai xe khai.
- Trang thai gom cac truong hop nhu khop, thieu chuyen tai xe, tai xe khai du.

`XL_VanChuyen`:

- Protected sheet.
- Doc `NL_VanChuyen`, `DM_Xe`, `DM_DuAn`, `DM_ThamSo`, `DM_DonGiaVanChuyen`.
- Tinh khoi luong, km, gia dau ap dung, don gia, doanh thu, cong ty so huu.

`XL_LuongTheoXe`:

- Protected sheet.
- Doc `NL_TaiXe`, `NL_NghiVanHanh`, `DM_ThamSo`, `DM_LuongChuyen`.
- Tong hop chuyen theo xe/tai xe, giam KPI, tinh luong chuyen.

`XL_LuongNhanSu`:

- Protected sheet.
- Doc `DM_NhanSu`, `XL_LuongTheoXe`, `NL_ChamCong`, `IMP_ThuChi` va cac nguon lien quan.
- Tinh luong cung, nghi phep, ung luong/phat/thuong, thuc linh.

`XL_NgoaiLe`:

- Protected sheet.
- Doc `NL_TaiXe`, `DM_PhanCongLaiXe`, `XL_LuongTheoXe`, `DM_ThamSo`.
- Phat hien ngoai le phan cong/tai xe/luong.

`XL_ThuongQuanLy`:

- Protected sheet.
- Doc `XL_LuongTheoXe`, `DM_ThuongQuanLy`, `DM_NhanSu`, `NL_TaiXe`, `NL_NghiVanHanh`, `NL_ChamCong`.
- Tinh thuong quan ly/tuyen dung theo dieu kien.

### Sheet bao cao Van tai

`BC_TongQuan`:

- Protected sheet.
- La nguon chinh cho dashboard web app.
- O `B1` la controller thang bao cao.
- Web app co the tam thay doi `B1` de lay chi tiet theo thang.
- Cac vung report gom KPI, doanh thu/chi phi/loi nhuan va chi tiet theo thang.

`BC_BangLuong`:

- Protected sheet.
- Formula-driven report tu `XL_LuongNhanSu`.
- Co subtotal o dong dau.

`BC_TongHopXe`:

- Protected sheet.
- Formula-driven report tong hop theo xe.
- Co subtotal o dong dau.

`SYS_ReportCache`:

- Hidden sheet.
- Cot: `cacheVersion`, `dataVersion`, `monthKey`, `monthLabel`, `rowOrder`, `colA` den `colE`.
- Do web app dung de cache report chi tiet.

### Danh muc Van tai

`DM_Xe`:

- Bien so xe, Khoi luong, Loai xe, Trang thai, Ghi chu, Cong ty so huu.

`DM_DuAn`:

- Ten du an, So km, Hieu luc tu, Hieu luc den, Ghi chu.

`DM_NhanSu`:

- Nhan su, Chuc vu, Nguoi tuyen, Bat dau thuong, Ket thuc thuong, Ngay vao, Ngay nghi viec, Luong cung, Ngay nghi, Trang thai, danh sach tai xe dang lam, Loai luong, Luong khoan, thang bat dau/ket thuc khoan, Ghi chu.

`DM_PhanCongLaiXe`:

- Bien so, Tai xe, Vai tro, Tu ngay, Den ngay, Duoc huong moc?, Thieu lai?, Ghi chu.

`DM_LuongChuyen`:

- Ma loai tinh, Dien giai, Tu chuyen, Den chuyen, Don gia/chuyen, Hieu luc tu, Hieu luc den.

`DM_ThamSo`:

- Tham so chung.
- Lich su gia dau.
- Duoc frontend tach thanh 2 tab ao `DM_ThamSo_TS` va `DM_ThamSo_GD`.

`DM_DonGiaVanChuyen`:

- Du an, Tu chuyen, Den chuyen, Don gia goc, Ghi chu.

`DM_ThuongQuanLy`:

- Ma thuong, Noi dung thuong, Dieu kien, So tien/xe, Trang thai, Ghi chu, Hieu luc tu, Hieu luc den.

`DM_PhatNoiBo`:

- Ma phat, Noi dung phat, So tien, Trang thai, Ghi chu, Hieu luc tu, Hieu luc den.

`IMP_ThuChi`:

- Hidden sheet import tu file Thu chi ID `1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw`.
- Cot: So phieu, Ngay, Muc, So tien, Nha cung cap, Noi dung, Thang tinh, Doi tuong, Loai tinh, Cong no.
- Cong thuc quan trong:
  - `IMPORTRANGE` tu file Thu chi.
  - Cong thuc phan loai ung luong/phat/thuong/thue/tra luong/phi duong bo/gop quy/xang dau/chi phi xe/khac.

### Protected ranges Van tai

Protected sheet `warningOnly=false`:

- `XL_DoiSoatChuyen`
- `XL_VanChuyen`
- `XL_LuongTheoXe`
- `XL_LuongNhanSu`
- `XL_NgoaiLe`
- `XL_ThuongQuanLy`
- `BC_TongQuan`
- `BC_BangLuong`
- `BC_TongHopXe`

Named ranges:

- Khong co named range trong export schema.

Dropdown/validation quan trong:

- `NL_NghiVanHanh` co validations cho xe/du an.
- Cac dropdown khac neu co the duoc cap qua web app/catalog hoac khong xuat hien ro trong schema. Chua ro, can xac nhan.

## 8. Cau truc Google Sheet Thu chi

Thong tin file:

- Ten spreadsheet: `ThuChiDongBac_2026`
- Spreadsheet ID: `1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw`
- Timezone: `Asia/Saigon`
- Locale: `vi_VN`
- Exported: `2026-06-25T10:48:05.491Z`
- Named ranges: 11

Danh sach sheet:

| Sheet | Vai tro | Ghi chu chinh |
| --- | --- | --- |
| `BOT_USERS` | Cau hinh user Telegram | Hidden. |
| `BC_THUCHI` | Bao cao Thu chi | Dashboard/report thu chi, cong no, filter thoi gian, action checkbox. |
| `BC_VAY` | Bao cao vay | Bao cao khoan vay, tra lai, tra no. |
| `NHAP_THUCHI` | Nhap thu chi | Sheet nhap lieu thu/chi/cong no. |
| `NHAP_VAY` | Nhap khoan vay | Sheet nhap vay/tra no/tra lai. |
| `INPHIEU` | In phieu | Hidden, template in hoa don/phieu. |
| `CAIDAT` | Cai dat | Named ranges, danh muc, so du, ngay nhap lieu, ngay tinh vay. |
| `BOT_MEDIA` | Log media Telegram | Hidden. |
| `BOT_LOG` | Log bot/action | Hidden. |

### Named ranges Thu chi

| Named range | Range | Y nghia |
| --- | --- | --- |
| `MUCTHU` | `CAIDAT!E3:E12` | Danh muc muc thu. |
| `MUCCHI` | `CAIDAT!H3:H36` | Danh muc muc chi. |
| `HINHTHUC` | `CAIDAT!C3:C5` | Hinh thuc tien. |
| `TM` | `CAIDAT!C3` | Tien mat. |
| `TK` | `CAIDAT!C4` | Tai khoan. |
| `TMDK` | `CAIDAT!R3` | Tien mat dau ky. |
| `TKDK` | `CAIDAT!R4` | Tai khoan dau ky. |
| `NOPTIEN` | `CAIDAT!E11` | Nop vao tai khoan. |
| `RUTTIEN` | `CAIDAT!E12` | Rut tien. |
| `NGAYNHAPLIEU` | `CAIDAT!R6` | Ngay nhap lieu mac dinh. |
| `NGAYTINHVAY` | `CAIDAT!R7` | Ngay tinh vay. |

### Sheet nhap lieu Thu chi

`NHAP_THUCHI`:

- Cot: So phieu, Ngay, MUC THU, MUC CHI, Hinh thuc, So tien, Nguoi Thu/Chi, Doi tac, Noi dung, Cong no, cot phu, cot trong, Cong no con lai, Loc.
- Cong thuc quan trong:
  - Cot loc dung de ket hop filter theo `BC_THUCHI`.
  - Cot cong no con lai tinh theo cong no/thanh toan.
- Dropdown/validation:
  - Ngay la date.
  - Muc thu, muc chi, nguoi thu/chi, doi tac lay tu named range/range cau hinh.
  - Cong no co list `Co`.
- Protected ranges:
  - `M:N` warningOnly.
  - `J1:J162` warningOnly, duoc `onEdit.js` co the mo rong.

`NHAP_VAY`:

- Cot: Ma, Ngay, Loai, Hinh thuc, Doi tac, So tien, Ky han vay (Thang), Lai suat/nam, Ky han tra lai, Ngay tra lai lan dau, Noi dung, cac cot phu, Loc.
- Cong thuc quan trong:
  - Cot loc dung de ket hop filter theo `BC_VAY`.
- Dropdown/validation:
  - Ngay va ngay tra lai la date.
  - Loai co list `Vay`.
  - Doi tac lay tu range cau hinh.
- Protected ranges:
  - `N:N` warningOnly.

### Sheet bao cao Thu chi

`BC_THUCHI`:

- Bao cao thu/chi/cong no.
- Co nhieu cong thuc va checkbox dieu khien.
- Cong thuc quan trong:
  - Vung filter thoi gian.
  - Cong thuc tong thu/tong chi/cong no.
  - Cac o tong hop danh muc.
- Dropdown/validation:
  - Cac checkbox dieu khien thoi gian/view/action.
  - Cac o ngay filter.
  - Cac o nhap so tien thanh toan cong no.
- Protected sheet:
  - `warningOnly=true`.

`BC_VAY`:

- Bao cao vay/tra no/tra lai.
- Cong thuc quan trong:
  - Filter theo thoi gian va doi tac/khoan vay.
  - Query danh sach khoan vay.
  - Lookup thong tin khoan vay.
- Dropdown/validation:
  - Checkbox view/filter.
  - Date filters.
  - List sap xep `Moi vay, Lon nhat`.
- Protected sheet:
  - `warningOnly=true`.

`INPHIEU`:

- Hidden template in phieu.
- Cong thuc quan trong:
  - Dung ham custom `docso` de doc so tien bang chu.
- Validation:
  - O chon ngay/so phieu co date validation.

`CAIDAT`:

- Chua danh muc, named ranges, so du dau ky, ngay nhap lieu, ngay tinh vay.
- Cong thuc quan trong:
  - Tong hop danh muc theo che do bao cao.
  - Query top category.
- Validation:
  - Date cho `NGAYNHAPLIEU`, `NGAYTINHVAY`.
  - Fixed list cho cac gia tri nhu Nop vao TK, Rut tien, Khoan vay, Tra no, Tra lai.
- Protected ranges:
  - `F:F` warningOnly.
  - `I:I` warningOnly.
  - `T:W` warningOnly.

`BOT_USERS`, `BOT_MEDIA`, `BOT_LOG`:

- Hidden.
- Phuc vu Telegram/bot/log.
- Web app hien tai co dung truc tiep cac sheet nay hay khong: Chua ro, can xac nhan.

## 9. Apps Script di kem file Thu chi

Thu muc thuc te: `docs/source/thu_chi_bound_script/`.

File:

- `appsscript.json`
- `menu.js`
- `cellButtons.js`
- `docso.js`
- `macro.js`
- `onEdit.js`
- `theme.js`

Day la script bound voi file Thu chi, nen viec dung `SpreadsheetApp.getActiveSpreadsheet()` trong nhom script nay la hop ly trong ngu canh file Thu chi. Khong nen tron nhom script bound nay vao web app doc lap neu chua tach lop adapter/cau hinh.

### `menu.js`

Ham chinh:

- `onOpen`

Menu custom tao tren Google Sheet:

- `QUAN LY THU CHI`
  - Thu chi
    - Bao cao thu chi -> `xemthuchi`
    - Nhap thu chi -> `nhapthuchi`
  - Cong no
    - Bao cao cong no -> `xemcongno`
    - Thanh toan cong no -> `xemcongno`
  - Khoan vay
    - Bao cao khoan vay -> `tongquanvay`
    - Nhap khoan vay -> `khoanvay`
  - Giao dien
    - Ap dung theme dashboard -> `applyPinterestTheme`
    - Tao nut dashboard -> `setupDashboardCellButtons`
    - Tao nut Thu chi -> `setupThuChiCellButtons`
    - Tao nut Vay -> `setupVayCellButtons`
    - Ap dung theme Thu chi -> `applyPinterestThemeThuChi`
    - Ap dung theme Vay -> `applyPinterestThemeVay`
    - Refresh borders -> `refreshPinterestThemeBorders`
  - In hoa don -> `inhoadon`
  - Cai dat -> `caidat`

### `cellButtons.js`

Ham chinh:

- `handleDashboardEdit_`
- `setupDashboardCellButtons`
- `setupThuChiCellButtons`
- `setupVayCellButtons`
- `resetXemCellButtons_`
- `insertCheckboxes_`
- `styleThuChiCellButtons_`
- `styleVayCellButtons_`
- `setCellButtonStyle_`
- `getThuChiButtonSheet_`
- `getVayButtonSheet_`

Chuc nang:
- Tao va style cac nut checkbox tren `BC_THUCHI` va `BC_VAY`.
- Route edit checkbox/dropdown sang cac macro tuong ung.

Control Thu chi:

- Thoi gian: `C3`, `D3`, `E3`, `G3`, `H3`, `I3`, `J3`.
- Action/view/category: `I4`, `O4`, `I5:I13`, `L5:L13`, `O5:O13`, `T5:T13`, `X5:X13`, `E11:E13`, `L15`, `P1:P2`.

Control Vay:

- Thoi gian: `P4:S4`.
- Cac control khac cua `BC_VAY`: Chua ro, can xac nhan.

### `docso.js`

Ham chinh:

- `dochangchuc`
- `docblock`
- `dochangtrieu`
- `docso`

Chuc nang:
- Doc so tien thanh chu tieng Viet.
- Duoc sheet `INPHIEU` su dung trong cong thuc.

### `macro.js`

Ham/chuc nang chinh:

- Dieu huong sheet:
  - `tongquanvay`
  - `khoanvay`
  - `inhoadon`
  - `nhapthuchi`
  - `back`
  - `caidat`

- View/filter Thu chi:
  - `xemthuchi`
  - `xemcongno`
  - `congnophaithu`
  - `congnophaitra`
  - `tatcachitieu`
  - `tatcacongno`
  - `xemthu`
  - `xemchi`

- Filter thoi gian Thu chi:
  - `tatcathoigian`
  - `homnay`
  - `homqua`
  - `tuannay`
  - `tuantruoc`
  - `thangnay`
  - `thangtruoc`

- Loc danh muc Thu chi:
  - `thu1` den `thu9`
  - `chi1` den `chi36`

- Filter thoi gian Vay:
  - `ls_tatcathoigian`
  - `ls_thangnay`
  - `ls_thangtruoc`
  - `ls_namnay`

- View/filter Vay:
  - `xemvay`
  - `xemtralai`
  - `xemtrano`
  - `xemtatcavay`
  - `locvay`
  - `loctrano`
  - `loctralai`

Chuc nang:
- Set cac o dieu khien/filter trong `BC_THUCHI` va `BC_VAY`.
- Dieu huong den cac sheet `BC_THUCHI`, `BC_VAY`, `NHAP_THUCHI`, `NHAP_VAY`, `INPHIEU`, `CAIDAT`.

### `onEdit.js`

Ham chinh:

- `onEdit`
- `showEditWarning_`
- `getVayLoanId_`
- `getVayLoanIdDisplay_`

Chuc nang:
- Xu ly automation khi nguoi dung sua file Thu chi.
- Goi `handleDashboardEdit_(e)` de xu ly cell buttons.
- Dieu phoi logic theo sheet dang edit:
  - `NHAP_THUCHI`
  - `BC_THUCHI`
  - `NHAP_VAY`
  - `BC_VAY`
  - `CAIDAT`
  - `INPHIEU`

Logic quan trong tren `NHAP_THUCHI`:

- Tu tao so phieu khi nhap ngay.
- Dam bao MUC THU va MUC CHI loai tru nhau.
- Gan formula loc.
- Kiem tra nhap so tien sau ngay/danh muc.
- Neu cong no = Co thi yeu cau doi tac va tinh cong no con lai.
- Cap nhat protection cot cong no.

Logic quan trong tren `BC_THUCHI`:

- Xu ly thanh toan cong no tren vung action.
- Tao checkbox/action validation.
- Khi xac nhan, append dong vao `NHAP_THUCHI`.
- Ho tro in phieu bang cach dien template `INPHIEU`.

Logic quan trong tren `NHAP_VAY`:

- Tu tao ma vay khi nhap ngay.
- Gan formula loc.
- Kiem tra ngay/loai/doi tac truoc khi nhap so tien.

Logic quan trong tren `BC_VAY`:

- Xu ly tra lai/tra no tren vung action.
- Khi xac nhan, append dong vao `NHAP_VAY`.
- Phan biet tra lai, tra het no goc, tra mot phan no goc.

### `theme.js`

Ham chinh:

- `applyPinterestTheme`
- `applyPinterestThemeThuChi`
- `applyPinterestThemeVay`
- `refreshPinterestThemeBorders`
- `setThemeStyle_`
- `setThemeBorders_`

Chuc nang:
- Style dashboard/report trong file Thu chi.
- Ap dung mau, border, dinh dang cho `BC_THUCHI` va `BC_VAY`.
- Range style chi tiet: Chua ro, can xac nhan neu can migration len web app.

## 10. Mapping ham script Thu chi doc/ghi sheet

| File/Ham | Doc sheet | Ghi sheet | Ghi chu |
| --- | --- | --- | --- |
| `menu.js/onOpen` | Khong | UI menu | Tao menu trong Google Sheet Thu chi. |
| `cellButtons.js/setupThuChiCellButtons` | `BC_THUCHI` | `BC_THUCHI` | Tao labels, checkboxes, style nut. |
| `cellButtons.js/setupVayCellButtons` | `BC_VAY` | `BC_VAY` | Tao labels, checkboxes, style nut. |
| `cellButtons.js/handleDashboardEdit_` | `BC_THUCHI`, `BC_VAY` | `BC_THUCHI`, `BC_VAY` | Route checkbox/filter sang macro. |
| `docso.js/docso` | Khong ro sheet truc tiep | Khong | Custom formula cho `INPHIEU`. |
| `macro.js` navigation | `BC_THUCHI`, `BC_VAY`, `NHAP_THUCHI`, `NHAP_VAY`, `INPHIEU`, `CAIDAT` | Active sheet/view | Dieu huong sheet. |
| `macro.js` filter Thu chi | `BC_THUCHI`, `CAIDAT` | `BC_THUCHI` | Set filter ngay, view, muc thu/chi/cong no. |
| `macro.js` filter Vay | `BC_VAY`, `BC_THUCHI` | `BC_VAY` | Set filter ngay, view vay/tra no/tra lai. |
| `onEdit.js/onEdit` tren `NHAP_THUCHI` | `NHAP_THUCHI`, `CAIDAT` | `NHAP_THUCHI` | Tao so phieu, validation, formula loc, cong no. |
| `onEdit.js/onEdit` tren `BC_THUCHI` | `BC_THUCHI`, `NHAP_THUCHI`, `INPHIEU`, `CAIDAT` | `BC_THUCHI`, `NHAP_THUCHI`, `INPHIEU` | Thanh toan cong no va in phieu. |
| `onEdit.js/onEdit` tren `NHAP_VAY` | `NHAP_VAY`, `CAIDAT` | `NHAP_VAY` | Tao ma vay, validation, formula loc. |
| `onEdit.js/onEdit` tren `BC_VAY` | `BC_VAY`, `NHAP_VAY`, `CAIDAT` | `BC_VAY`, `NHAP_VAY` | Tra lai/tra no. |
| `theme.js` | `BC_THUCHI`, `BC_VAY` | `BC_THUCHI`, `BC_VAY` | Dinh dang giao dien trong Google Sheet. |

## 11. Cong thuc, dropdown, protected ranges quan trong

### Van tai

Cong thuc quan trong:

- Cac sheet `NL_*` co cot thang tu ngay bang `ARRAYFORMULA`.
- `NL_Dau` co cong thuc thanh tien = so lit * gia dau.
- `NL_Phat` lookup noi dung/so tien tu `DM_PhatNoiBo`.
- `NL_ChamCong` tinh so ngay, tinh luong cung, nhom xu ly.
- `NL_NghiVanHanh` tinh KPI/giam KPI.
- `XL_*` la cac sheet xu ly cong thuc, khong nen ghi truc tiep neu khong co migration/logic rieng.
- `BC_TongQuan!B1` la o dieu khien thang bao cao.
- `IMP_ThuChi` dung `IMPORTRANGE` sang file Thu chi.
- `SYS_ReportCache` la cache do web app ghi.

Dropdown/validation quan trong:

- `NL_NghiVanHanh` co dropdown/validation cho xe/du an.
- Cac dropdown khac trong file Van tai: Chua ro, can xac nhan.

Protected ranges:

- Cac sheet xu ly va bao cao `XL_*`, `BC_*` duoc protect `warningOnly=false`.

### Thu chi

Cong thuc quan trong:

- `NHAP_THUCHI` co cot loc va cot cong no con lai.
- `NHAP_VAY` co cot loc.
- `BC_THUCHI` co filter key, filter thoi gian, tong hop thu/chi/cong no.
- `BC_VAY` co filter key, query/lookup khoan vay, tinh tra no/tra lai.
- `INPHIEU` dung custom formula `docso`.
- `CAIDAT` chua named ranges, so du dau ky, ngay nhap lieu, ngay tinh vay.

Dropdown/validation quan trong:

- `NHAP_THUCHI`:
  - Date validation cho ngay.
  - Dropdown muc thu/muc chi/hinh thuc/nguoi thu chi/doi tac.
  - Cong no list `Co`.
- `NHAP_VAY`:
  - Date validation.
  - Loai list `Vay`.
  - Doi tac range.
- `BC_THUCHI`:
  - Nhieu checkbox dieu khien view/filter/action.
  - Date filters.
  - Number validation cho so tien thanh toan cong no.
- `BC_VAY`:
  - Checkbox dieu khien view/filter.
  - Date filters.
  - List sap xep `Moi vay, Lon nhat`.
- `CAIDAT`:
  - Date cho `NGAYNHAPLIEU`, `NGAYTINHVAY`.
  - Fixed list cho cac gia tri cau hinh.

Protected ranges:

- `BC_THUCHI` protected sheet `warningOnly=true`.
- `BC_VAY` protected sheet `warningOnly=true`.
- `NHAP_THUCHI!M:N` warningOnly.
- `NHAP_THUCHI!J1:J162` warningOnly, co the duoc script mo rong.
- `NHAP_VAY!N:N` warningOnly.
- `CAIDAT!F:F`, `CAIDAT!I:I`, `CAIDAT!T:W` warningOnly.

## 12. Diem chua ro, can xac nhan

- Thu muc `docs/source/thu_chi_bound_script/Button/` co phai la duong dan cu, hay can tao/di chuyen source vao cau truc moi?
- Web app doc lap da co module Thu chi frontend/back-end nao chua, hay hien tai moi chi co Apps Script bound voi file Thu chi?
- Cach chon cap file theo nam trong tuong lai:
  - Mot `datasetKey` dai dien cho cap Van tai/Thu chi?
  - Hay tach `transportSpreadsheetId` va `cashflowSpreadsheetId` rieng?
- Cach thay the cac macro bound Thu chi khi dua vao web app:
  - Giu script bound nhu automation sheet?
  - Hay migrate dan sang service cua web app?
- Cac dropdown trong file Van tai ngoai `NL_NghiVanHanh` co duoc tao bang validation trong sheet, bang named range, hay bang web app? Chua ro, can xac nhan.
- Vung style chi tiet cua `theme.js` neu can dua len web app: Chua ro, can xac nhan.
- Cac sheet Telegram `BOT_USERS`, `BOT_MEDIA`, `BOT_LOG` co nam trong scope web app moi hay chi la automation rieng cua file Thu chi? Chua ro, can xac nhan.

## 13. De xuat huong tai cau truc tiep theo

Phan nay chi la goi y tai lieu, chua sua code.

- Tach cau hinh dataset theo nam:
  - `year`
  - `transportSpreadsheetId`
  - `cashflowSpreadsheetId`
  - `enabledModules`

- Tach service backend theo module:
  - `TransportService`
  - `CashflowService`
  - `DatasetConfigService`
  - `CacheServiceAdapter`

- Khong dua nguyen script bound Thu chi vao web app.
  - Nen phan loai script Thu chi thanh:
    - Logic co the giu trong Google Sheet automation: `onEdit`, cell buttons, theme.
    - Logic nen migrate len web app: read/report/create transaction/payment/loan.

- Chuan hoa tai lieu schema:
  - Tao alias hoac file latest khong timestamp:
    - `docs/schema/van_tai_2026_schema_raw.json`
    - `docs/schema/thu_chi_2026_schema_raw.json`
  - Giu file timestamp lam history/export artifact.

- Khi bat dau tich hop Thu chi vao web app, can tao mapping API rieng:
  - `getCashflowDashboard`
  - `getCashflowReports`
  - `submitCashflowRows`
  - `submitLoanRows`
  - `getCashflowCatalogs`
  - `saveCashflowRow`
  - `deleteCashflowRow`

