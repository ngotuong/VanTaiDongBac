# Code Classification Report

Ngay lap: 2026-06-25

Pham vi:
- Chi phan tich va tao tai lieu.
- Chua sua code chuc nang.
- Khong chay `clasp push`.
- Khong `git push`.

Muc tieu:
- Phan loai tung file va tung ham theo kien truc web app standalone.
- Khoanh vung code bound voi Google Sheet truc tiep.
- Chi ra code nen giu lai, code nen tach rieng/Legacy, va code can nguoi dung xac nhan.

## Nhom phan loai

| Nhom | Y nghia |
| --- | --- |
| A | Web app UI / routing |
| B | API server cho web app |
| C | Nghiep vu van tai |
| D | Nghiep vu thu chi |
| E | Ham chi dung cho Google Sheet truc tiep |
| F | Ham tien ich dung chung |
| G | Ham export schema / cong cu noi bo |
| H | Ham khong ro muc dich |

## Ket luan nhanh

- Code web app standalone hien nam chu yeu o cac file goc: `Router.gs`, `PublicApi.gs`, `AppConfig.gs`, `SheetService.gs`, `ValidationService.gs`, `index.html`, `client_*.html`, `styles_*.html`.
- Code bound voi Google Sheet Thu chi nam trong `docs/source/thu_chi_bound_script/`.
- Cac lenh `SpreadsheetApp.getActiveSpreadsheet()`, `SpreadsheetApp.getUi()`, `SpreadsheetApp.getActive()`, `SpreadsheetApp.getActiveSheet()`, custom menu, `onOpen`, `onEdit`, `onSelectionChange` chi xuat hien trong source Thu chi bound-sheet, khong xuat hien trong backend web app chinh.
- `SheetService.gs` dung `SpreadsheetApp.openById(APP_CONFIG.spreadsheetId)`, phu hop voi web app standalone hon `getActiveSpreadsheet()`.
- `SheetService.gs` dang tron nhieu vai tro: API service, data access, cache, nghiep vu Van tai, CRUD danh muc. Nen tach trong lo trinh refactor.
- Script Thu chi bound-sheet khong nen dua nguyen trang vao web app standalone. Nen dua vao `Legacy/thu_chi_bound_script` hoac giu rieng trong docs/source, sau do migrate tung nghiep vu can thiet sang service Thu chi moi.
- `docs/source/thu_chi_bound_script/appsscript.json` co danh sach macro cu nhu `home`, `tatcasono`, `a`, `myFunction`, `myFunction1...` nhung khong thay function tuong ung trong source da doc. Can nguoi dung xac nhan.

## Phan loai theo file

| File | Nhom | Danh gia | Khuyen nghi |
| --- | --- | --- | --- |
| `appsscript.json` | B | Manifest web app standalone. Co `webapp`, scope spreadsheet, runtime V8. | Giu lai. |
| `.clasp.json` | G | Cau hinh clasp noi bo. | Giu lai, khong dua vao logic app. |
| `Code.gs` | H/F | Chi la marker, khong co logic. | Co the giu hoac bo sau khi refactor neu khong can. |
| `AppConfig.gs` | B/F | Cau hinh spreadsheet active theo request/properties/year. | Giu lai, nen mo rong thanh dataset config gom Van tai + Thu chi. |
| `Router.gs` | A/B | Entry HTTP `doGet`, `doPost`, render UI, route API. | Giu lai, nen tach debug/dev route khoi production. |
| `PublicApi.gs` | B | Wrapper public cho `SheetService`. | Giu lai, sau nay tach `TransportApi`/`CashflowApi`. |
| `SheetService.gs` | B/C/F | Service chinh cho Van tai, doc/ghi sheet, cache, report. | Giu lai nhung can tach thanh data access, transport service, report service, cache adapter. |
| `ValidationService.gs` | C/F | Validate/build row cho form Van tai. | Giu lai, nen doi ten thanh `TransportValidationService`. |
| `index.html` | A | Ban build/tong hop frontend. Chua duplicate logic tu `client_*.html`. | Khong nen refactor truc tiep neu co source module; nen build tu `client_*.html`. |
| `client.html` | A | Include aggregator cho cac module frontend. | Giu lai neu Apps Script template van dung. |
| `client_config.html` | A/C/F | Nav, form schema Van tai, state, helper UI. | Giu lai, nen tach config Van tai ra module rieng. |
| `client_api.html` | A/B/F | REST client goi web app backend. | Giu lai, nen chuan hoa API client. |
| `client_app.html` | A/F | Init app, navigation, export image. | Giu lai. |
| `client_dashboard.html` | A/C | Render dashboard Van tai. | Giu lai, nen tach ViewModel tinh toan KPI khoi render. |
| `client_entry.html` | A/C | Render form nhap lieu Van tai. | Giu lai, nen module hoa theo domain Van tai. |
| `client_data.html` | A/B/C/F | State/data loading/submission cho Van tai. | Giu lai, nhung can tach API calls, local cache, business helpers. |
| `client_reports.html` | A/C/F | Render bao cao Van tai, subtotal, month filters. | Giu lai, nen tach format/parse utilities. |
| `client_manage.html` | A/B/C/F | UI quan ly nhat ky Van tai, CRUD, filters. | Giu lai, can tach generic grid/modal helpers. |
| `client_catalog.html` | A/B/C | UI danh muc Van tai, reuse manage CRUD. | Giu lai, can tach danh muc Van tai khoi generic catalog view. |
| `client_ui.html` | A/F | Busy/status/drawer/settings/escape. | Giu lai. |
| `styles.html` | A | Include aggregator CSS. | Giu lai. |
| `styles_*.html` | A | CSS web app. | Giu lai. |
| `docs/schema/van_tai_2026_schema_raw_20260625_175704.json` | G | Export schema file Van tai. | Giu trong docs/tooling, khong deploy neu khong can. |
| `docs/schema/thu_chi_2026_schema_raw_20260625_175010.json` | G | Export schema file Thu chi. | Giu trong docs/tooling, khong deploy neu khong can. |
| `docs/source/thu_chi_bound_script/appsscript.json` | E/H | Manifest cua script bound Thu chi, co macros cu/khong ro. | Chuyen Legacy hoac tach package bound-sheet; can nguoi dung xac nhan macro cu. |
| `docs/source/thu_chi_bound_script/menu.js` | E/D | Custom menu Google Sheet Thu chi. | Khong phu hop web app standalone; giu Legacy/bound-sheet. |
| `docs/source/thu_chi_bound_script/cellButtons.js` | E/D | Cell buttons, checkbox controls cho Sheet Thu chi. | Khong phu hop web app standalone; giu Legacy/bound-sheet. |
| `docs/source/thu_chi_bound_script/macro.js` | E/D/H | Macro dieu huong/filter Thu chi/Vay trong Google Sheet. | Tach Legacy; migrate logic nghiep vu can thiet sang CashflowService. |
| `docs/source/thu_chi_bound_script/onEdit.js` | E/D | Simple trigger/automation edit trong Google Sheet Thu chi. | Khong dua vao standalone; giu bound-sheet hoac migrate tung use case. |
| `docs/source/thu_chi_bound_script/docso.js` | D/F | Custom formula doc so tien bang chu. | Co the giu bound-sheet; neu web app can in phieu, migrate thanh utility. |
| `docs/source/thu_chi_bound_script/theme.js` | E | Style Google Sheet Thu chi. | Chuyen Legacy/bound-sheet, khong thuoc web app UI. |
| `AGENTS.md` | G | Quy tac lam viec/kien truc. | Giu docs. |
| `APP_ARCHITECTURE.md` | G | Tai lieu kien truc hien tai. | Giu docs. |
| `PROJECT_SCHEMA.md` | G | Tai lieu schema/architecture vua tao. | Giu docs. |
| `ARCHITECTURE_REFACTOR.md` | G | Tai lieu refactor. | Giu docs. |
| `VanTaiDongBac_2026_HANDOFF.md` | G | Handoff/tai lieu nguon. | Giu docs. |
| `README.md` | G | Tai lieu repo. | Giu docs. |

## Cac ham entrypoint, trigger, custom UI

| Ham | File | Loai | Nhom | Danh gia |
| --- | --- | --- | --- | --- |
| `doGet(e)` | `Router.gs` | Web app HTTP GET | A/B | Phu hop standalone. Giu lai. |
| `doPost(e)` | `Router.gs` | Web app HTTP POST | B | Phu hop standalone. Giu lai. |
| `onOpen()` | `docs/source/thu_chi_bound_script/menu.js` | Google Sheet simple trigger | E/D | Chi dung khi bound voi Sheet Thu chi. Nen Legacy/tach rieng. |
| `onEdit(e)` | `docs/source/thu_chi_bound_script/onEdit.js` | Google Sheet simple trigger | E/D | Chi dung khi nguoi dung sua sheet truc tiep. Nen Legacy/tach rieng. |
| `onSelectionChange(e)` | `docs/source/thu_chi_bound_script/cellButtons.js` | Google Sheet simple trigger | E/H | Hien return ngay, khong co tac dung. Nen Legacy hoac xoa sau khi xac nhan. |

Installable trigger:
- Khong tim thay `ScriptApp.newTrigger` trong source da quet.
- Khong tim thay ham tao trigger rieng.

Google Sheet macro manifest:
- `docs/source/thu_chi_bound_script/appsscript.json` co khai bao macro `homnay`, `home`, `tatcasono`, `back`, `xemtatcavay`, `a`, `myFunction`, `myFunction1...myFunction8`.
- Trong source hien tai chi thay mot so ham nhu `homnay`, `back`, `xemtatcavay`.
- Cac ham `home`, `tatcasono`, `a`, `myFunction*` khong thay trong source. Cần người dùng xác nhận.

## Ham dung `SpreadsheetApp.getActiveSpreadsheet()`

Tat ca nam trong `docs/source/thu_chi_bound_script/`:

| Ham | File:line | Nhom | Danh gia |
| --- | --- | --- | --- |
| `setupThuChiCellButtons` | `cellButtons.js:172` | E/D | Toast sau khi setup nut sheet. Khong phu hop standalone. |
| `setupVayCellButtons` | `cellButtons.js:191` | E/D | Toast sau khi setup nut sheet. Khong phu hop standalone. |
| `getThuChiButtonSheet_` | `cellButtons.js:277` | E/D | Lay active spreadsheet de tim `BC_THUCHI`. Khong phu hop standalone. |
| `getVayButtonSheet_` | `cellButtons.js:282` | E/D | Lay active spreadsheet de tim `BC_VAY`. Khong phu hop standalone. |
| `setThuChiTimeControl_` | `macro.js:13` | E/D | Set checkbox/filter tren `BC_THUCHI`. Khong phu hop standalone. |
| `setVayTimeControl_` | `macro.js:20` | E/D | Set checkbox/filter tren `BC_VAY`. Khong phu hop standalone. |
| `setThuChiViewControl_` | `macro.js:27` | E/D | Set view checkbox tren `BC_THUCHI`. Khong phu hop standalone. |
| `xemthuchi` | `macro.js:71` | E/D | Dieu khien sheet/view/filter. Legacy/bound-sheet. |
| `xemcongno` | `macro.js:86` | E/D | Dieu khien sheet/view/filter. Legacy/bound-sheet. |
| `congnophaithu` | `macro.js:110` | E/D | Dieu khien sheet/view/filter. Legacy/bound-sheet. |
| `congnophaitra` | `macro.js:130` | E/D | Dieu khien sheet/view/filter. Legacy/bound-sheet. |
| `locvay` | `macro.js:742` | E/D | Lay active spreadsheet, set filter vay. Legacy/bound-sheet. |
| `loctrano` | `macro.js:760` | E/D | Lay active spreadsheet, set filter tra no. Legacy/bound-sheet. |
| `loctralai` | `macro.js:779` | E/D | Lay active spreadsheet, set filter tra lai. Legacy/bound-sheet. |
| `onEdit` | `onEdit.js:6` | E/D | Automation edit tren file Thu chi. Legacy/bound-sheet. |
| `applyPinterestTheme` | `theme.js:51` | E | Toast active spreadsheet. Legacy/bound-sheet. |
| `applyPinterestThemeThuChi` | `theme.js:59` | E | Style `BC_THUCHI`. Legacy/bound-sheet. |
| `applyPinterestThemeVay` | `theme.js:241` | E | Style `BC_VAY`. Legacy/bound-sheet. |
| `refreshPinterestThemeBorders` | `theme.js:291` | E | Style border Google Sheet. Legacy/bound-sheet. |

Khong thay `SpreadsheetApp.getActiveSpreadsheet()` trong cac file web app chinh.

## Ham dung `SpreadsheetApp.getUi()`

| Ham | File:line | Cach goi | Nhom | Danh gia |
| --- | --- | --- | --- | --- |
| `onOpen` | `menu.js:3` | `SpreadsheetApp.getUi()` | E/D | Tao custom menu Google Sheet. Khong phu hop standalone. |
| `onEdit` | `onEdit.js:5` | `var app = SpreadsheetApp; var ui = app.getUi();` | E/D | Phu thuoc UI Google Sheet. Bien `ui` co ve khong duoc dung tiep; can nguoi dung xac nhan truoc khi xoa. |

## Ham dung Google Sheet active context khac

Ngoai `getActiveSpreadsheet()`, source Thu chi bound-sheet con dung:

- `SpreadsheetApp.getActive()` trong hau het macro dieu huong/filter cua `macro.js`, va trong `onEdit.js` khi nhay sang `INPHIEU`.
- `SpreadsheetApp.getActiveSheet()` rat nhieu lan trong `onEdit.js`.
- `ss.getActiveCell()` trong `onEdit.js`.
- `SpreadsheetApp.newDataValidation()` trong `onEdit.js` de tao dropdown/checkbox.
- `Range.insertCheckboxes()` trong `cellButtons.js`.
- `toast()` trong `cellButtons.js`, `theme.js`, `onEdit.js`.

Nhan dinh:
- Day la code chi phu hop voi Google Sheet UI truc tiep.
- Neu dua vao web app standalone can thay bang `openById(id)`, API request body, va UI web app tuong ung.

## Phan loai ham web app backend

### `AppConfig.gs`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `AppConfig.activate` | B/F | Giu | Kich hoat config theo spreadsheet id. |
| `AppConfig.activateFromEvent` | B/F | Giu | Lay config tu request. |
| `buildConfig_` | B/C | Giu, can tach | Hien hard-code sheets Van tai. Nen tach dataset config. |
| `resolveSpreadsheetId_` | B/F | Giu | Dung Script Properties/year/request. |
| `clean_` | F | Giu | Utility noi bo. |

### `Router.gs`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `doGet` | A/B | Giu | Web app entrypoint. Action `debugSheet` nen xep dev/debug. |
| `doPost` | B | Giu | API POST cho ghi/sua/xoa. |
| `jsonResponse_` | B/F | Giu | Utility response JSON. |
| `renderIndex_` | A | Giu | Render web app UI. |
| `include` | A/F | Giu | Template include. |

### `PublicApi.gs`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `getInitialData` | B/C | Giu | Wrapper Van tai. |
| `getBootstrap` | B | Giu | Wrapper bootstrap. |
| `getCatalogs` | B/C | Giu | Wrapper danh muc Van tai. |
| `getDashboard` | B/C | Giu | Wrapper dashboard Van tai. |
| `getReports` | B/C | Giu | Wrapper reports Van tai. |
| `getReport` | B/C | Giu | Wrapper single report. |
| `getReportBundle` | B/C | Giu | Wrapper report bundle. |
| `invalidateCaches` | B/F | Giu | Wrapper clear cache. |
| `submitRows` | B/C | Giu | Wrapper ghi nhap lieu Van tai. |
| `checkTripReconciliation` | B/C | Giu | Wrapper doi soat Van tai. |
| `readSheetData` | B/C | Giu | CRUD/read generic cho Van tai. |
| `saveSheetRow` | B/C | Giu | CRUD generic cho Van tai. |
| `deleteSheetRow` | B/C | Giu | CRUD generic cho Van tai. |

### `SheetService.gs`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `getBootstrap` | B | Giu | API data khoi tao. |
| `getInitialData` | B/C | Giu | Bootstrap + catalogs Van tai. |
| `getCatalogs` | B/C | Giu | Doc danh muc Van tai co cache. |
| `getDashboard` | B/C | Giu | Dashboard Van tai. |
| `getReports` | B/C | Giu | Reports Van tai. |
| `getReport` | B/C | Giu | Report theo type. |
| `getReportBundle` | B/C | Giu | Bundle report, can tiep tuc toi uu. |
| `emptyReports_` | F | Giu | Utility response rong. |
| `reportLinks_` | B/F | Giu | Tao link sheet. |
| `sheetLink_` | F | Giu | Helper link gid. |
| `submitRows` | B/C | Giu | Ghi `NL_*`; nen tach TransportWriteService. |
| `checkTripReconciliation` | C | Giu | Nghiep vu doi soat Van tai. |
| `getSpreadsheet_` | B/F | Giu | Dung `openById`, phu hop standalone. |
| `readCatalogs_` | C | Giu, can tach | Doc danh muc Van tai. |
| `catalogNeeds_` | C/F | Giu | Toi uu doc catalog theo form. |
| `readRows_` | F | Giu | Data access helper. |
| `readParams_` | C/F | Giu | Doc `DM_ThamSo`. |
| `readOverviewReport_` | C | Giu | Bao cao Tong quan. |
| `readOverviewDashboard_` | C | Giu | Dashboard nhanh. |
| `readOverviewMonths_` | C/F | Giu | Doc thang report. |
| `getActiveReportMonths_` | C/F | Giu | Helper thang active. |
| `resolveReportMonth_` | C/F | Giu | Helper chon thang. |
| `readOverviewDetailsWithCache_` | C/F | Giu, can xem lai | Cache report chi tiet. |
| `readAggregatedOverviewDetails_` | C/F | Giu | Tong hop nhieu thang. |
| `readCurrentOverviewDetails_` | C/F | Giu | Doc chi tiet hien tai. |
| `aggregateOverviewDetailMatrices_` | C/F | Giu | Tong hop matrix report. |
| `formatAggregateDetailCell_` | F | Giu | Format cell. |
| `computeAndCacheOverviewDetails_` | C/F | Giu, can can than | Tam ghi `BC_TongQuan!B1` va flush. Phu hop standalone nhung co side effect len sheet. |
| `getReportDataVersion_` | F | Giu | Cache version. |
| `bumpReportDataVersion_` | F | Giu | Tang data version. |
| `getReportCacheSheet_` | F/G | Giu | Tao/lay `SYS_ReportCache`; co ghi sheet an. |
| `readReportDetailsCacheMap_` | F | Giu | Doc cache sheet. |
| `writeReportDetailsCache_` | F | Giu | Ghi cache sheet. |
| `readInputStats_` | C | Giu | Thong ke nhap lieu Van tai. |
| `readTable_` | F | Giu | Doc table report. |
| `readReportTables_` | C/F | Giu | Doc `BC_BangLuong`, `BC_TongHopXe`. |
| `sumTripsByPairs_` | C/F | Giu | Sum chuyen cho doi soat. |
| `pairKey_` | F | Giu | Key ngay/xe. |
| `getAppendRow_` | F | Giu | Tim dong append. |
| `getLastNonEmptyRowInColumn_` | F | Giu | Tim dong cuoi. |
| `ensureRows_` | F | Giu | Them row neu thieu. |
| `applyFormatsSafely_` | F/C | Giu, can xem lai | Co the gay warning do typed column. Nen toi uu/han che format. |
| `clean_` | F | Giu | Utility. |
| `serializeDate_` | F | Giu | Utility date. |
| `parseSheetDate_` | F | Giu | Utility date. |
| `parseNumberLoose_` | F | Giu | Utility number. |
| `normalizeMonthKey_` | F | Giu | Utility key. |
| `cacheKey_` | F | Giu | Cache key. |
| `filterDisplayTableByMonth_` | C/F | Giu | Filter report. |
| `normalizeDisplayMonth_` | F | Giu | Month normalization. |
| `putChunkedCache_` | F | Giu | CacheService chunk. |
| `getChunkedCache_` | F | Giu | CacheService chunk. |
| `removeChunkedCache_` | F | Giu | CacheService chunk. |
| `clearAfterSubmitCache_` | F | Giu | Cache invalidation. |
| `invalidateCaches` | B/F | Giu | API clear cache. |
| `invalidateRuntimeCaches_` | F | Giu | Clear runtime cache. |
| `readLatestTrips_` | C | Giu | Dashboard chuyen gan day. |
| `parseOverview_` | H | Can nguoi dung xac nhan | Co ve helper cu/khong thay goi trong file. |
| `readSheetData` | B/C | Giu | Read generic cho manage/catalog. |
| `saveSheetRow` | B/C | Giu | CRUD row, co logic giu formula. |
| `deleteSheetRow` | B/C | Giu | Delete/clear row. |

### `ValidationService.gs`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `buildRows` | C/F | Giu | Build rows Van tai. |
| `buildOne_` | C | Giu | Dispatch theo form Van tai. |
| `buildVanChuyen_` | C | Giu | Nghiep vu form Van chuyen. |
| `buildTaiXe_` | C | Giu | Nghiep vu form Tai xe. |
| `buildDau_` | C | Giu | Nghiep vu form Dau. |
| `buildChamCong_` | C | Giu | Nghiep vu Cham cong. |
| `buildPhat_` | C | Giu | Nghiep vu Phat. |
| `buildNghiVanHanh_` | C | Giu | Nghiep vu Nghi van hanh. |
| `isBlankRow_` | F | Giu | Utility. |
| `requireText_` | F | Giu | Validation helper. |
| `requireDate_` | F | Giu | Validation helper. |
| `requirePositiveNumber_` | F | Giu | Validation helper. |
| `parseDate` | F | Giu | Utility chung. |
| `monthDate_` | H | Can nguoi dung xac nhan | Khong thay duoc goi trong file hien tai. |
| `daysInclusive_` | H | Can nguoi dung xac nhan | Khong thay duoc goi trong file hien tai. |
| `parseNumber` | F | Giu | Utility chung. |
| `findBy_` | F | Giu | Lookup helper. |
| `warnIfMissing_` | F | Giu | Warning helper. |
| `defaultChamCongGroup_` | H/C | Can nguoi dung xac nhan | Khong thay duoc goi trong file hien tai. |
| `defaultSalary_` | H/C | Can nguoi dung xac nhan | Khong thay duoc goi trong file hien tai. |
| `normalize_` | F | Giu | Utility. |
| `clean_` | F | Giu | Utility. |

## Phan loai ham frontend web app

### `client_config.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `setManageSheetTab` | A/C | Giu | UI tab quan ly Van tai. |
| `setCatalogSheetTab` | A/C | Giu | UI tab danh muc Van tai. |
| `formatTableDate` | F | Giu | Utility date display. |
| `createAutocomplete` | A/F | Giu | UI component helper. |

### `client_api.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `callApi` | A/B/F | Giu | REST client. |
| `removeSessionKeysByPrefix` | F | Giu | Session cache helper. |
| `invalidateReportSessionCache` | F | Giu | Frontend cache invalidation. |
| `invalidateServerCaches` | A/B/F | Giu | Goi API clear cache. |

### `client_app.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `init` | A | Giu | Khoi tao web app. |
| `renderAll` | A | Giu | Render root views. |
| `renderNav` | A | Giu | Render navigation. |
| `setView` | A | Giu | Chuyen view, trigger load data. |
| `renderView` | A | Giu | Set active view/title. |
| `loadHtml2Canvas` | A/F | Giu | Lazy load export image lib. |
| `restoreExportCardState` | A/F | Giu | Restore UI sau export. |
| `exportCardAsImage` | A/F | Giu | Export card report thanh anh. |

### `client_dashboard.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `renderHomeSummaryTable` | A/C | Giu | Render summary dashboard. |
| `renderDashboard` | A/C | Giu | Render Tong quan. |
| `renderLatestTripsTable` | A/C | Giu | Render chuyen gan day. |
| `renderMetrics` | A/C | Giu | Render KPI. |
| `renderProfitChart` | A/C | Giu | Chart loi nhuan. |
| `renderQuickActions` | A/C | Giu | Nut nhanh theo input stats. |
| `buildQuickAction` | A/C | Giu | Tao quick action item. |

### `client_entry.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `renderFormTabs` | A/C | Giu | Tabs form Van tai. |
| `renderEntry` | A/C | Giu | Render form entry. |
| `renderRecentSubmissions` | A/C | Giu | Lich su submit gan day frontend. |
| `getEntryRowExtraTitle` | A/C | Giu | Text phu cho row. |
| `renderRow` | A/C | Giu | Render row input. |
| `renderField` | A/C | Giu | Render field theo schema. |

### `client_data.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `newBlankRow` | C/F | Giu | Tao row input. |
| `getOptions` | A/C/F | Giu | Lay options tu catalog. |
| `handleFieldChange` | A/C | Giu | Xu ly change field. |
| `suggestDrivers` | C | Giu | Goi y tai xe theo phan cong. |
| `isInRange` | F | Giu | Date range helper. |
| `parseLocaleNumber` | F | Giu | Number parse frontend. |
| `getEmptyCatalogs` | F | Giu | Default catalogs. |
| `getCurrentCatalogs` | C/F | Giu | Lay catalogs form active. |
| `loadAllCatalogsIfNeeded` | A/B/C | Giu | Load all catalogs. |
| `getDashboardData` | A/C/F | Giu | Lay report/dashboard state. |
| `getLinks` | F | Giu | Link helper. |
| `addRow` | A/C | Giu | Them row entry. |
| `cloneRow` | A/C | Giu | Clone row entry. |
| `submitAll` | A/B/C | Giu | Submit form Van tai. |
| `checkTripReconciliation` | A/B/C | Giu | Goi API doi soat. |
| `describeRow` | A/C | Giu | Mo ta row submitted. |
| `loadCatalogs` | A/B/C | Giu | Load catalog theo form. |
| `loadDashboard` | A/B/C | Giu | Load dashboard. |
| `getReportBundleCacheKey` | F | Giu | Cache key frontend. |
| `scheduleReportBundlePrefetch` | A/B/F | Giu | Prefetch reports. |
| `loadReportBundle` | A/B/C | Giu | Load report bundle. |
| `refreshReports` | A/B/C | Giu | Refresh report/dashboard. |

### `client_reports.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `renderReports` | A/C | Giu | Render report page. |
| `filterReportCards` | A/F | Giu | Search filter report cards. |
| `renderTableCard` | A/C | Giu | Render table report. |
| `removeAccents` | F | Giu | Utility text. |
| `parseCellValue` | F | Giu | Parse value for subtotal. |
| `formatValueLike` | F | Giu | Format subtotal like sample. |
| `updateTableSubtotals` | A/C/F | Giu | Subtotal in UI. |
| `parseOverview` | C/F | Giu | Parse overview matrix frontend. |
| `ensureSelectedMonth` | C/F | Giu | Month filter state. |
| `getSelectedOverviewRow` | C/F | Giu | Selected row helper. |
| `renderMonthFilters` | A/C | Giu | Render month filter. |
| `filterOverviewMatrix` | C/F | Giu | Filter overview by month. |
| `buildSelectedDetails` | C/F | Giu | KPI details. |
| `parseMoney` | F | Giu | Money parse. |
| `formatCurrencyParts` | F | Giu | Currency format. |
| `formatCurrencyText` | F | Giu | Currency text. |

### `client_manage.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `loadManageSheetData` | A/B/C | Giu | Load sheet data manage. |
| `renderManageTable` | A/C | Giu | Render table manage. |
| `debounceManageSearch` | A/F | Giu | Debounce search. |
| `debounceCatalogSearch` | A/F | Giu | Debounce catalog search. |
| `debounceReportSearch` | A/F | Giu | Debounce report search. |
| `buildVehicleOwnerMap` | C/F | Giu | Map xe -> cong ty so huu. |
| `normalizeFilterValue` | F | Giu | Normalize filter. |
| `filterManageRows` | A/C/F | Giu | Filter manage data. |
| `openManageAddModal` | A/C | Giu | Open add modal. |
| `openManageEditModal` | A/C | Giu | Open edit modal. |
| `closeManageModal` | A | Giu | Close modal. |
| `getManageFieldOptions` | A/C | Giu | Select options theo header/sheet. |
| `buildManageModalFields` | A/C | Giu | Build modal fields. |
| `saveManageRow` | A/B/C | Giu | Goi API save row. |
| `deleteManageRow` | A/B/C | Giu | Goi API delete row. |

### `client_catalog.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `loadCatalogSheetData` | A/B/C | Giu | Load danh muc. |
| `renderCatalogTable` | A/C | Giu | Render danh muc. |
| `filterCatalogRows` | A/C/F | Giu | Filter danh muc. |
| `openCatalogAddModal` | A/C | Giu | Reuse manage add modal. |

### `client_ui.html`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `setBusy` | A/F | Giu | Busy state submit. |
| `setRefreshBusy` | A/F | Giu | Busy state refresh. |
| `showStatus` | A/F | Giu | Toast/status UI. |
| `clearStatus` | A/F | Giu | Clear status. |
| `openDrawer` | A | Giu | Mobile drawer. |
| `closeDrawer` | A | Giu | Mobile drawer. |
| `setupConfigInput` | A/B | Giu | Configure backend URL. |
| `escapeHtml` | F | Giu | Utility security/display. |

## Phan loai ham script Thu chi bound-sheet

### `menu.js`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `onOpen` | E/D | Chuyen Legacy/tach rieng | Tao custom menu trong Google Sheet Thu chi bang `SpreadsheetApp.getUi()`. |

### `cellButtons.js`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `onSelectionChange` | E/H | Legacy hoac xoa sau xac nhan | Return ngay, co ve khong con dung. |
| `handleDashboardEdit_` | E/D | Legacy | Route checkbox trong `BC_THUCHI`/`BC_VAY`. |
| `runDashboardFunction_` | E/F | Legacy | Goi global macro theo ten. |
| `resetOneShotAction_` | E/F | Legacy | Reset checkbox action. |
| `setupDashboardCellButtons` | E/D | Legacy | Setup nut ca Thu chi va Vay trong Sheet. |
| `setupThuChiCellButtons` | E/D | Legacy | Ghi labels/checkbox/style vao `BC_THUCHI`. |
| `setupVayCellButtons` | E/D | Legacy | Ghi labels/checkbox/style vao `BC_VAY`. |
| `resetXemCellButtons_` | E/D | Legacy | Reset checkbox actions. |
| `insertCheckboxes_` | E/F | Legacy | Dung `insertCheckboxes()` tren sheet. |
| `styleThuChiCellButtons_` | E | Legacy | Style vung controls. |
| `styleVayCellButtons_` | E | Legacy | Style vung controls. |
| `setCellButtonStyle_` | E/F | Legacy | Helper style cell button. |
| `getThuChiButtonSheet_` | E/D | Legacy | Dung active spreadsheet de lay `BC_THUCHI`. |
| `getVayButtonSheet_` | E/D | Legacy | Dung active spreadsheet de lay `BC_VAY`. |

### `docso.js`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `dochangchuc` | D/F | Co the giu | Utility doc so tien; neu web app in phieu thi migrate. |
| `docblock` | D/F | Co the giu | Utility doc so tien. |
| `dochangtrieu` | D/F | Co the giu | Utility doc so tien. |
| `docso` | D/F | Co the giu | Custom formula cho `INPHIEU`; co the migrate thanh shared utility. |

### `macro.js`

| Ham/nhom ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `xoa`, `xoa2` | H/E | Can nguoi dung xac nhan | Ten qua chung, khong ro muc dich. `xoa2` dung active spreadsheet. |
| `setThuChiTimeControl_` | E/D | Legacy | Set checkbox filter Thu chi. |
| `setVayTimeControl_` | E/D | Legacy | Set checkbox filter Vay. |
| `setThuChiViewControl_` | E/D | Legacy | Set checkbox view Thu chi. |
| `setChiSummaryHeader_` | E/D | Legacy | Set label tong hop chi. |
| `tongquanvay`, `khoanvay`, `inhoadon`, `nhapthuchi`, `back`, `caidat` | E/D | Legacy | Navigation trong Google Sheet. |
| `xemthuchi`, `xemcongno`, `congnophaithu`, `congnophaitra` | E/D | Legacy, co logic can migrate | Set che do report/cong no. |
| `tatcathoigian`, `homnay`, `homqua`, `tuannay`, `tuantruoc`, `thangnay`, `thangtruoc` | E/D | Legacy, co logic can migrate | Filter thoi gian Thu chi. |
| `tatcachitieu`, `tatcacongno`, `xemthu`, `xemchi` | E/D | Legacy | View/filter Thu chi. |
| `thu1` den `thu9` | E/D | Legacy, co logic can migrate | Loc muc thu theo o tren `BC_THUCHI`. |
| `chi1` den `chi36` | E/D | Legacy, co logic can migrate | Loc muc chi theo o tren `BC_THUCHI`. |
| `ls_tatcathoigian`, `ls_thangnay`, `ls_thangtruoc`, `ls_namnay` | E/D | Legacy, co logic can migrate | Filter thoi gian Vay. |
| `xemvay`, `xemtralai`, `xemtrano`, `xemtatcavay` | E/D | Legacy, co logic can migrate | View/filter Vay. |
| `xoaloc` | E/D | Legacy | Clear filter Thu chi. |
| `locvay`, `loctrano`, `loctralai` | E/D | Legacy, co logic can migrate | Dong bo filter ngay tu `BC_THUCHI` sang `BC_VAY`. |

### `onEdit.js`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `onEdit` | E/D | Legacy/tach rieng | Automation edit truc tiep tren file Thu chi; khong phu hop web app standalone. Mot so nghiep vu can migrate: tao phieu, thanh toan cong no, tao/tra khoan vay. |
| `showEditWarning_` | E/F | Legacy hoac migrate | Hien toast sheet. Web app can thay bang UI status. |
| `getVayLoanId_` | D/F | Co the migrate | Helper lay ma vay tu report row. |
| `getVayLoanIdDisplay_` | D/F | Co the migrate | Helper display ma vay. |

### `theme.js`

| Ham | Nhom | Giu/chuyen | Ghi chu |
| --- | --- | --- | --- |
| `applyPinterestTheme` | E | Legacy | Style Google Sheet, toast. |
| `applyPinterestThemeThuChi` | E | Legacy | Style `BC_THUCHI`. |
| `applyPinterestThemeVay` | E | Legacy | Style `BC_VAY`. |
| `refreshPinterestThemeBorders` | E | Legacy | Refresh border sheet. |
| `setThemeStyle_` | E/F | Legacy | Helper style range. |
| `setThemeBorders_` | E/F | Legacy | Helper border range. |

## Ham co ve khong phu hop voi web app standalone

Khong phu hop neu dua nguyen trang vao web app standalone:

- `onOpen`
- `onEdit`
- `onSelectionChange`
- Toan bo `menu.js`
- Phan lon `cellButtons.js`
- Phan lon `macro.js`
- Toan bo `theme.js`
- Cac ham dung `SpreadsheetApp.getActiveSpreadsheet()`, `SpreadsheetApp.getActive()`, `SpreadsheetApp.getActiveSheet()`, `SpreadsheetApp.getUi()`, `getActiveCell()`, `toast()`, `insertCheckboxes()`, `SpreadsheetApp.newDataValidation()` de dieu khien UI Google Sheet.

Ly do:
- Web app standalone khong co active spreadsheet UI cua nguoi dung.
- Web app can nhan `spreadsheetId`/`year`/`datasetKey` ro rang va doc/ghi bang `openById`.
- UI nen nam tren HTML web app, khong phu thuoc checkbox/menu trong Google Sheet.

## Ham co the giu lai

Nen giu trong web app core:

- `Router.gs`: `doGet`, `doPost`, `jsonResponse_`, `renderIndex_`, `include`.
- `AppConfig.gs`: `activate`, `activateFromEvent`, `resolveSpreadsheetId_`, nhung nen mo rong cau hinh dataset.
- `PublicApi.gs`: toan bo wrapper hien tai, tam giu cho Van tai.
- `SheetService.gs`: cac ham doc/ghi/report/cache Van tai, nhung can tach module.
- `ValidationService.gs`: cac ham validate/build row Van tai, nen doi ten/tach module.
- `client_*.html`: UI web app hien tai, giu lam nguon chinh.
- `styles_*.html`: CSS web app.
- `docso.js`: co the giu/migrate neu web app can in phieu doc tien bang chu.

## Ham/file nen chuyen sang Legacy hoac tach rieng

Nen chuyen sang `docs/legacy/thu_chi_bound_script/` hoac mot package rieng cho bound-sheet:

- `docs/source/thu_chi_bound_script/menu.js`
- `docs/source/thu_chi_bound_script/cellButtons.js`
- `docs/source/thu_chi_bound_script/macro.js`
- `docs/source/thu_chi_bound_script/onEdit.js`
- `docs/source/thu_chi_bound_script/theme.js`
- `docs/source/thu_chi_bound_script/appsscript.json`

Nen can nhac tach rieng trong web app:

- `SheetService.gs` -> `TransportService`, `TransportRepository`, `ReportCacheService`, `SheetRepository`.
- `ValidationService.gs` -> `TransportValidationService`.
- `client_data.html` -> `apiClient`, `transportState`, `transportActions`.
- `client_manage.html`/`client_catalog.html` -> generic grid/modal helpers + Transport-specific configs.

## Ham khong ro muc dich hoac co dau hieu cu

| Ham/file | Vi tri | Ly do | Khuyen nghi |
| --- | --- | --- | --- |
| `parseOverview_` | `SheetService.gs` | Khong thay goi trong source hien tai. | Cần người dùng xác nhận. |
| `monthDate_` | `ValidationService.gs` | Khong thay goi. | Cần người dùng xác nhận. |
| `daysInclusive_` | `ValidationService.gs` | Khong thay goi. | Cần người dùng xác nhận. |
| `defaultChamCongGroup_` | `ValidationService.gs` | Khong thay goi. | Cần người dùng xác nhận. |
| `defaultSalary_` | `ValidationService.gs` | Khong thay goi. | Cần người dùng xác nhận. |
| `xoa` | `macro.js` | Ten qua chung, khong ro muc dich khi nhin rieng. | Cần người dùng xác nhận. |
| `xoa2` | `macro.js` | Ten qua chung, dung active spreadsheet. | Cần người dùng xác nhận. |
| `onSelectionChange` | `cellButtons.js` | Return ngay, co ve placeholder/cu. | Cần người dùng xác nhận. |
| Macro `home`, `tatcasono`, `a`, `myFunction*` | `docs/source/thu_chi_bound_script/appsscript.json` | Khai bao trong manifest nhung khong thay source ham. | Cần người dùng xác nhận. |

## Ranh gioi kien truc de refactor tiep

De tranh tiep tuc lan code, nen thong nhat ranh gioi:

1. Web app standalone
   - Chi dung `doGet`, `doPost`, `HtmlService`, `ContentService`.
   - Doc/ghi sheet bang `SpreadsheetApp.openById(id)`.
   - Khong dung `SpreadsheetApp.getUi()`.
   - Khong dung `SpreadsheetApp.getActiveSpreadsheet()` cho du lieu nghiep vu chinh.

2. Module Van tai
   - Gom form Van tai, danh muc Van tai, dashboard/report Van tai.
   - Hien dang nam trong `SheetService.gs`, `ValidationService.gs`, `client_*`.

3. Module Thu chi web app
   - Chua co module standalone ro rang trong code web app hien tai.
   - Can thiet ke moi `CashflowService` doc/ghi file Thu chi bang `openById(cashflowSpreadsheetId)`.

4. Google Sheet bound automation
   - Gom custom menu, onOpen, onEdit, cell buttons, theme.
   - Chi nen song trong package bound-sheet rieng, khong tron vao web app core.

5. Legacy/source archive
   - Luu script Thu chi cu de tham chieu nghiep vu.
   - Khong deploy cung web app standalone neu khong co ly do ro rang.

