# PROJECT_CONTEXT

File nay la handoff/living roadmap chinh cua du an. Khi bat dau mot cuoc tro chuyen moi, hay doc file nay truoc, sau do doc them `AGENTS.md`, `PROJECT_SCHEMA.md`, `SUPABASE_SCHEMA.md`, `WORKFLOW.md`, va `ROLLBACK.md` neu tac vu co lien quan.

## Muc tieu san pham

- Web app noi bo cho Van tai Dong Bac, deploy frontend tren Vercel.
- Apps Script la backend/API va van duoc dong bo bang clasp.
- Google Sheet Van tai va Google Sheet Thu chi van la nguon du lieu chuan.
- Supabase dung lam database/cache doc nhanh, khong thay the Google Sheet o giai doan hien tai.
- Nguoi dung noi bo khoang 4-5 nguoi, uu tien tra cuu nhanh, bao cao dung, nhap lieu an toan.

## Dinh huong kien truc muc tieu

- Google Sheet: noi doi soat, bao cao, backup va kiem tra cong thuc; khong dung lam backend thao tac nhanh cho frontend ve lau dai.
- Supabase: database thao tac nhanh cho web app, bao gom doc nhanh va tien toi ghi nhanh/co trang thai.
- Apps Script: cau noi dong bo hai chieu co kiem soat giua Google Sheet va Supabase; chay worker ghi Sheet, sync cache, log loi va retry.
- Vercel: giao dien nguoi dung; khong giu service role key va khong ghi truc tiep vao Google Sheet.
- Giai doan truoc mat: Google Sheet van la nguon doi soat cuoi cung, nhung thao tac web app can phan hoi nhanh bang cach tao y dinh ghi trong Supabase truoc, sau do worker dong bo ve Sheet.
- Huong dich chuyen thao tac chinh: `Web app -> Supabase -> tra ket qua ngay`, sau do Apps Script dong bo ve Google Sheet o nen. Khong thiet ke them luong moi bat frontend cho Google Sheet ghi xong truoc khi phan hoi, tru khi thao tac do bat buoc can ket qua cong thuc Sheet ngay lap tuc.

## Nguyen tac bat buoc

- Khong bo Google Sheet, Apps Script, hoac Vercel trong giai doan hien tai.
- Khong dua service role key vao frontend.
- Khong commit `.env` hoac secret key.
- Khong tu y doi ten sheet, doi thu tu cot, xoa cong thuc trong Google Sheet.
- Khong gop du lieu Van tai va Thu chi neu chua duoc yeu cau.
- Khi doc/ghi du lieu chinh, uu tien `SpreadsheetApp.openById(id)`.
- Moi thay doi lien quan bao cao phai uu tien tinh dung so lieu hon toc do.

## Trang thai hien tai

### Ha tang

- GitHub remote: `origin https://github.com/ngotuong/VanTaiDongBac.git`
- Frontend production: `https://dongbac.vercel.app`
- Apps Script deployment URL:
  `https://script.google.com/macros/s/AKfycby6kfup2sXJruP8lnxwW_qzl064qvTLx94JItkBoJV-I14DNY9Ml35q44Gko9knuOBRCQ/exec`
- Apps Script deployment moi nhat da xac nhan: `@252 - Refactor Step 10 extract cache audit service`
- Apps Script deployments da don ngay 2026-07-06: chi con `@HEAD` va production `AKfycby6... @234`; cac deployment cu `@145`, `@212`, `@213` da undeploy de tranh goi nham URL.
- Vercel production env `VITE_APP_SERVICE_URL` da cap nhat ve URL `AKfycby6...`; production `https://dongbac.vercel.app` da xac nhan khong con tro URL `@212`.
- Supabase project da link va frontend dang doc bang anon key.

### Supabase cache da co

- `report_bundles`: Bao cao/Tong quan theo thang.
- `fund_overview_bundles`: Quy's tong quan.
- `fund_transaction_bundles`: Giao dich Quy, gom `recent_500` va `month:YYYY-MM`.
- `fund_loan_bundles`: Vay no.
- `sync_status`: trang thai sync.
- `startup_bundles`: cache man hinh khoi dong.
- `catalog_bundles`: cache danh muc/startup.
- `manage_data_bundles`: cache Van hanh `recent_500` va `month:YYYY-MM`.

### Frontend doc Supabase

- Man hinh dau/startup doc Supabase truoc, fallback Apps Script.
- Tong quan/Bao cao doc `report_bundles`.
- Quy doc cache Supabase cho tong quan, giao dich, vay no; giao dich co cache theo thang.
- Van hanh doc cache mac dinh/recent va theo thang khi co bo loc phu hop.
- Danh muc doc cache Supabase khi co.
- Neu Supabase loi/thieu cache, frontend fallback Apps Script.

## Quyet dinh gan day ve Bao cao

Ngay 2026-07-04, phat hien UI Bao cao bi sai so lieu va sai y nghia danh muc vi frontend tu dung lai bang:

- `Báo cáo tổng quan` tung bi dung tu `buildOverviewSummaryMatrix_(parsed.rows)` nen header/cot khong con dung nguyen goc Sheet.
- `Báo cáo chi tiết` tung bi dung tu `buildSelectedDetails(selected)` nen ten danh muc bi tu dat lai.
- KPI/cache tung match nham chu `lương` trong `khối lượng`, lam sai `payroll`.
- Cache chi tiet Supabase cua `05/2026` va `06/2026` tung bi lap so thang `07/2026`.

Da sua:

- `client_reports.html`: `Báo cáo tổng quan` render truc tiep `dashboard.overview.months`.
- `client_reports.html`: `Báo cáo chi tiết` render truc tiep `dashboard.overview.details`.
- `SheetService.gs`: chi match cot luong bang `chi phí lương` hoac `tổng lương`, khong match moi chu `lương`.
- `SheetService.gs`: tinh chi tiet thang bang sheet tam copy tu `BC_TongQuan`, set `B1` tren sheet tam, doc ket qua, roi xoa sheet tam. Khong con lam `BC_TongQuan!B1` goc tu nhay.
- Da sync lai Supabase `report_bundles` cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`.

Commit lien quan:

- `57745f0 Restore exact overview report data`
- `d623753 Render overview details without B1 cache`
- `f7c6ae6 Restore overview KPI without mutating month selector`

### PWA / App Icon (Ngày 2026-07-04 & 2026-07-05)

- Thiết kế ảnh nguồn mới dựa trên ảnh mẫu của user, giữ chữ "ĐÔNG BẮC TRANSPORT" sắc nét, loại bỏ "VAN TAI DB" và lấp đầy khung 1024x1024.
- Cập nhật script `scripts/generate-icons.js` dùng `sharp` để đọc trực tiếp file PNG nguồn `assets/app-icon/app-icon-source.png` nhằm bảo toàn hiệu ứng phát sáng neon và gradient 3D mượt mà của ảnh mẫu.
- Thêm thuộc tính `"id": "/"` vào `manifest.json` để định danh PWA.
- Thêm query parameter `?v=2` vào các link icon ở `<head>` và `manifest.json` để ép trình duyệt (như Chrome trên máy tính/điện thoại) xóa cache và cập nhật ngay favicon mới.
- Thay thế logo text "ĐB" dạng tĩnh tại sidebar của web app bằng logo ảnh thực tế `apple-touch-icon.png?v=2` (kế thừa class `.brand-mark` để tự động bo góc tròn đồng bộ).

### UI mobile / Thu chi (Ngày 2026-07-04)

- `FundService.addFundTransactions()` tra ve them `spreadsheetId`, `spreadsheetName`, `firstRow`, `lastRow` de truy vet dung file/sheet/dong vua ghi.
- Frontend Quy chi bao thanh cong khi backend xac nhan so dong chen khop so giao dich da gui; thong bao thanh cong co kem sheet va khoang dong.
- Danh muc > Nhan su: bo chu "Trang thai" tren bo loc mobile, gom tim kiem + trang thai + nut them moi tren cung mot hang gon hon.
- Danh muc > Danh sach xe: them bo loc cong ty/chu xe tren cung hang voi tim kiem va nut them moi.
- Card danh sach mobile bo nhan "Thao tac", chi giu icon sua/xoa.
- Sua loi `displaySheetName is not defined` lam Danh muc khong render duoc.
- Van hanh bo chu "Ky" tren bo loc ky va can lai kich thuoc o ky mobile bang nhom ngay.
- Bao cao bo dong tieu de/ghi chu trong panel loc de tiet kiem chieu cao.
- Sua loi nhan ban Thu chi bang cach tao ma phieu co millisecond va hau to theo thu tu dong trong batch, tranh trung ma khi luu nhieu dong cung luc.
- Quy > Khoan vay doc truc tiep Apps Script va khi loc thang chi tinh KPI/chi tiet tren cac khoan vay phat sinh trong thang do.
- Van hanh > Xang dau tren mobile quay lai bang ngang co horizontal scroll/sticky cot, khong render thanh card.
- Sua loi `isDauSheet` o ham loc Van hanh lam man hinh Xang dau khong tai duoc.
- Bao cao doi nhan tab thanh `Tat Ca`, `Tong Quan`, `Chi Tiet`, `Bang Luong`, `Tong Hop Xe` va tang sticky/z-index cho thanh tab de khong bi toolbar de len.
- Bo icon Google Sheet trong tung bang bao cao, thay bang nut xuat CSV/Excel; chi giu icon mo Google Sheet tren topbar.
- Bao cao mobile tang offset sticky cua thanh tab duoi panel loc de khong bi che khi cuon; tang nhe font chu trong than bang bao cao, giu nguyen header/tab/tieu de.
- Them Dark mode trong menu Cai dat, luu localStorage `dongbac_theme`, doi theme-color va token mau theo `data-theme`.
- Van hanh mobile gop hang Ky + Nhap moi vao cung card sticky voi bo loc ngay/tim kiem de tiet kiem chieu cao.
- Sua hien tuong iPhone auto zoom khi focus input/select bang cach dam bao controls mobile co computed font-size 16px.
- Bao cao doi thu tu sticky thanh tab len tren card bo loc, giong cac menu khac; filter nam duoi tab voi offset sticky-after-tabs.
- Bao cao can lai font body: cot danh muc dau dong cung co chu voi so lieu, rieng cot dien giai giu nho hon de khong vo bang.
- Quy > Nhap thu/chi: them rollback vung vua ghi neu Google Sheets/data validation bao loi giua batch, tranh tinh trang luu 3/4 dong roi bao loi.
- Quy > Nhap thu/chi mobile: sau khi them/nhan ban/xoa dong se tu cuon den dong lien quan; drawer co vung scroll rieng va padding day de tranh man hinh trang khi iPhone keyboard/focus.

### Supabase cache after-write (Ngày 2026-07-05)

- `Router.doPost()` da duoc rut ve dung chung `invokeApi('POST', ...)`, tranh viec duong HTTP bo qua wrapper sync trong `PublicApi.gs`.
- Sửa/xóa dòng `DM_*` qua web app giờ đi qua `withSheetRowSync_()`, sync lai `startup_bundles`, cac `catalog_bundles`, va rieng `DM_ThamSo` sync them `DM_ThamSo_TS`/`DM_ThamSo_GD`.
- Sửa/xóa dòng `NL_*` qua web app giờ sync hẹp sau ghi: dashboard/latest report, `manage_data_bundles.recent_500`, cache thang lien quan neu co payload ngay, hoac 2 thang gan nhat neu khong xac dinh duoc ngay.
- Cac thao tac Quy/Thu chi truyen context giao dich/khoan vay vao `syncFundAfterWrite()`, sync them `fund_transaction_bundles.month:YYYY-MM`, `fund_overview_bundles.month_key`, va `fund_loan_bundles.month_key` theo thang lien quan; neu khong xac dinh duoc thang thi fallback 2 thang gan nhat.
- `syncRealtimeCache()` khong con la full backfill; tu 2026-07-06 ham nay la trigger tick gan realtime moi 1 phut, co lock va moi lan chi sync mot nhom nho. Full backfill thu cong chuyen sang `syncFullRealtimeCache()`.
- Sau khi test nhap Van Chuyen tu frontend static, phat hien route toi uu `submitRowsGet` ghi duoc Google Sheet nhung bo qua wrapper sync. Da sua `submitRowsGet` dung `invokeApi('POST', 'submitRows', ...)` va frontend sau khi nhap thanh cong goi `loadManageSheetData(true)` de doc Apps Script truc tiep mot lan, tranh hien bang cu tu Supabase/session cache.
- Sau do phat hien `submitRowsGet` van nguy hiem vi GET co the bi retry/nguoi dung bam lai khi sync Supabase keo dai, gay ghi trung 4-5 dong. Da tat route ghi GET, frontend quay ve POST that, va `submitRows` chi sync Supabase o che do nhanh cho cache Van hanh lien quan. `submitRows` cung copy format dong truoc va giu cong thuc o cot trong de tranh mat dinh dang/cong thuc khi ghi vao dong moi.
- Sau khi test lai, Google Sheets bao loi set number format voi cot co kieu du lieu dac biet. Da bo buoc `applyFormatsSafely_()` sau submit, chi giu copy format/cong thuc tu dong truoc; sync nhanh sau nhap chi cap nhat `manage_data_bundles.recent_500` cua sheet lien quan de request tra ve nhanh hon.
- Phat hien nhieu sheet rac `Bản sao của BC_TongQuan...` do ham tinh chi tiet bao cao copy `BC_TongQuan` lam sheet tam; neu Apps Script timeout/loi giua `copyTo()` va rename/delete thi ban copy mac dinh bi de lai. Da mo rong cleanup tu dong de xoa ca `_TMP_BC_TongQuan_*`, `Bản sao của BC_TongQuan...`, `Copy of BC_TongQuan...`; co the chay function `cleanupOverviewTempSheets()` trong Apps Script editor de don thu cong.

### Async write queue (Ngày 2026-07-05)

- Bat dau giai doan toi uu toc do ghi: `submitRows` cua module Van hanh khong ghi Google Sheet truc tiep trong request nua, ma enqueue vao Supabase `write_jobs` voi status `pending`.
- Apps Script worker `processWriteJobs()` doc job pending, ghi Google Sheet bang `EntryService.submitRows()`, cap nhat status `synced`/`failed`, ghi log vao `write_job_logs`, va sync nhanh cache Van hanh lien quan.
- Frontend sau khi bam Luu nhan `jobId`, hien trang thai dang dong bo, poll `getWriteJobStatus`, va reload bang Van hanh khi job `synced`.
- Retry thu cong co function `retryWriteJob(jobId)`. Worker trigger `processWriteJobs` duoc cai bang `installWriteJobTrigger()`; do `clasp run` co the bi tu choi quyen, `enqueueWriteJob()` cung tu goi `installWriteJobTrigger()` khi nhan lenh luu.
- Migration lien quan: `supabase/migrations/005_write_jobs.sql`.
- Sau test thuc te, them co che frontend goi `processWriteJobs` nen sau enqueue de kick worker ngay nhung khong cho nguoi dung cho response. Them trigger nhe `syncRecentManageDataCache` moi phut de lam tuoi `recent_500` cac sheet Van hanh khi co sua/xoa tay trong Google Sheet.
- Menu Van hanh neu doc Supabase cache mac dinh qua 90 giay se tu fallback Apps Script mot luot de tranh hien du lieu cu qua lau sau thao tac sua/xoa truc tiep tren Sheet.
- Rollback ngay sau test: async write v1 lam he thong kho debug, co `Load failed`, mo bang cham hon va cache Supabase van stale khi xoa tay trong Sheet. Hien tai `submitRows` da quay ve ghi Apps Script truc tiep; frontend khong poll/kick worker; `ASYNC_WRITE_ENABLED=false` trong `SupabaseService.gs` de cac trigger queue/sync recent neu con ton tai chi no-op. `write_jobs`/`write_job_logs` giu lai tren Supabase lam nen tang thu nghiem, chua dung cho nut Luu production.
- Sua card Tong quan `Chi phí vận hành`: loi den tu frontend tu cong cac cot chi phi theo fallback index cu, co the nham cot `Doanh thu chưa VAT` khi header khong match chinh xac. Tu 2026-07-05, card nay dung cong thuc `Tổng doanh thu - Lợi nhuận gộp` theo bang `BC_TongQuan`; backend `overview.kpis` tra them `operatingCost` de frontend uu tien nguon KPI chuan khi cache moi da sync.
- Ngay 2026-07-06 da backfill cache bang `clasp run`: cleanup temp report sheet ok/count 0; report bundles ok cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`; startup/catalog ok 17 bundle; fund ok 12 bundle cho `2026-05..07`; manage data ok 20 bundle. Ket luan: full backfill van dung thu cong, nhung qua nang cho trigger ngan han nen da chuyen trigger sang tick nho.
- Ngay 2026-07-06 da cai lai trigger `syncRealtimeCache` moi 1 phut o mode tick: lan cai dat removed 1 trigger cu, installed true. Tick thu cong sync duoc `reportsRecent`; cac lan sau co the `skipped` neu trigger nen dang chay. Sau test thuc te bi loi cho khoa khi ghi/xoa, da bo `ScriptLock` khoi trigger tick va thay bang co `CacheService`, de trigger nen khong tranh lock voi thao tac ghi Google Sheet.
- Ngay 2026-07-06 da go `client_secret.json` va `.clasp.json` khoi Git tracking, them `.gitignore` tracked de tranh commit lai credential/cau hinh local. Neu `client_secret.json` da tung len GitHub, nen rotate OAuth client secret trong Google Cloud.
- Audit doc Supabase ngay 2026-07-06: cac man hinh doc chinh da doc Supabase truoc/fallback Apps Script gom startup, dashboard/report, danh muc Van tai, Van hanh, Quy overview/giao dich/vay. Cac duong van doc Apps Script co chu dich gom `checkTripReconciliation` va cac thao tac ghi. Da dua `getFundFormOptions`/`getFundCatalog` sang doc Supabase truoc bang `catalog_bundles` key `fund_form_options:YYYY` va `fund_catalog:YYYY:group`; `saveFundCatalogItem`/`deleteFundCatalogItem` sync lai cac cache nay sau ghi.
- Da backfill `syncAllFundCatalogsToSupabase('2026')` thanh cong 6 bundle: form options va 5 nhom danh muc Quy.
- Ngay 2026-07-06 user xac nhan ghi/xoa Sheet xong nhung web app bao cap nhat cham. Da doi wrapper ghi Quỹ/Vận hành (`withFundSync_`, `withTransportSync_`, sua/xoa `NL_*`) sang tra response ngay sau khi Google Sheet ghi xong, gan `supabaseSync.deferred=true`; Supabase cache do trigger tick `syncRealtimeCache` cap nhat sau. UI sau ghi dung force refresh Apps Script de hien du lieu moi.
- So phieu giao dich Quy do web app tao dang co dang `yyMMddHHmmssSSS-xx` vi ghi bang Apps Script `setValues()` khong nen phu thuoc simple `onEdit(e)` cua file Thu chi de tu sinh cot A. Hau to `-xx` giup tranh trung khi luu nhieu dong cung batch/nhan ban nhanh.
- Ngay 2026-07-06 user test sua/xoa Van hanh thay popup cho lau va bang khong tu refresh. Nguyen nhan: `withSheetRowSync_()` sau sua/xoa `NL_*` dang goi sync Van hanh/Bao cao che do day du, va frontend reload lai bang khong force refresh nen co the doc Supabase cache cu. Da doi sua/xoa `NL_*` sang sync nhanh `{ fast: true }` va frontend save/delete Van hanh reload `loadManageSheetData(true)` kem toast loading.
- Huong nghien cuu so phieu Quy ngan hon: co the doi sang dang `TCyymmdd-xxxx` hoac `TCyymmdd-R<row>`, nhung can chon chien luoc chong trung. Dang `TCyymmdd-xxxx` dep nhung can daily sequence trong lock va quet cot A; dang row-based ngan va nhanh hon nhung phu thuoc dong append. Chua doi production neu chua test migration/compat voi cong thuc cong no.
- Ngay 2026-07-06 sua Quy > Khoan vay va Quy > Danh muc: `FundService` chuan hoa loai dong vay/tra khi doc `NHAP_VAY` de cac bien the `Tra goc`/`Tra no goc` deu duoc tinh vao `Da tra no goc`, giup `Du no cuoi ky` dung hon; lich su khoan vay khong con gioi han 100 dong de frontend phan trang 20 dong/trang tren toan bo du lieu da loc. Quy > Danh muc khong con tron fallback `Tu du lieu hien co`; cac tab chi tra gia tri cau hinh tu `CAIDAT`/catalog sheet theo nhom. Da deploy Apps Script `@224` va chay `syncAllFundBundlesToSupabase('2026')` thanh cong 13 bundle, failed 0.
- Ngay 2026-07-06 sua tiep KPI thang cua Quy > Khoan vay: khi loc thang, `Da tra no goc`/`Da tra lai`/`Tong khoan vay` tinh theo cac dong phat sinh trong thang, con `Du no cuoi ky` tinh luy ke toan bo vay/tra den ngay cuoi thang. Doi nhan bo loc tu `Tat ca thang` thanh `Tat ca`. Da deploy Apps Script `@225`, sync `syncAllFundBundlesToSupabase('2026')` thanh cong 13 bundle, deploy Vercel production ve `https://dongbac.vercel.app`; test HTTP thang `2026-06` tra `Da tra no goc = 23.008.000`, `Du no cuoi ky = 578.349.414`, `recentRows = 39`.
- Ngay 2026-07-06 bat dau buoc 3 gan realtime/co kha nang quan sat: them action `getSupabaseSyncStatus` doc bang `sync_status` qua Apps Script service role, va them card `Cai dat > Trang thai dong bo` tren frontend de xem cac cache moi nhat, status, message, tuoi cache. Da deploy Apps Script `@226`, deploy Vercel production; test HTTP `getSupabaseSyncStatus&limit=5` tra `ok=true`, co `realtime_cache_tick`, `dashboard`, `manage_data` status `ok`.
- Ngay 2026-07-06 bat dau buoc 3b write queue v2 cho luong hep `Van hanh > Nhap moi`: route POST `submitRows` khong ghi Sheet truc tiep nua ma enqueue `write_jobs` qua `SupabaseService.enqueueTransportSubmitRows()`. Chi bat co rieng `ASYNC_TRANSPORT_SUBMIT_ENABLED=true`, giu `ASYNC_WRITE_ENABLED=false` de khong bat lai v1 dai tra. Frontend khi bam Luu nhan `jobId`, hien pending trong nhat ky, kick worker `processWriteJobs` khong cho ket qua, poll `getWriteJobStatus`, reload bang Van hanh khi job `synced`, hien retry khi `failed`. Da deploy Apps Script `@227`, deploy Vercel production; test `clasp run processWriteJobs -p '[1]'` tra `{ processed: 0, ok: true }`, production HTML co `pendingWriteJobs`/`kickWriteJobWorker`.
- Ngay 2026-07-06 sua UX write queue v2: sau khi nhap moi Van hanh, cac dong `pending/processing/failed` duoc chen tam vao bang Van hanh dang xem dung sheet, co nhan `Dang dong bo` va khong cho sua/xoa khi chua co `rowIndex` that. Muc tieu la nguoi dung co the thay ngay dong vua nhap va xuat anh bao cao truoc khi worker ghi xong Google Sheet. Da deploy Vercel production, test HTML co `getManageRowsWithPending_`, `mapPendingEntryValue_`, `manage-pending-row`.
- Ngay 2026-07-07 sua tiep write queue v2 sau test thuc te: pending truoc do chi luu trong bo nho trinh duyet nen tat/mo web bi mat. Da them action `getRecentWriteJobs` doc `write_jobs` gan day qua Apps Script, frontend goi `loadRecentTransportWriteJobs()` khi khoi dong de khoi phuc job `pending/processing/failed` va `synced` gan day. Bang Van hanh va Tong quan > chuyen gan day se merge cac job nay, co dedupe neu cache that da co dong. Worker sau khi ghi Sheet xong sync them dashboard/latest trips bang `syncDashboard()` de Tong quan cap nhat som hon. Da deploy Apps Script `@229`, deploy Vercel production; test HTTP `getRecentWriteJobs` tra cac job `synced`, production HTML co `getLatestTripsWithPending_` va `loadRecentTransportWriteJobs`.
- Ngay 2026-07-07 bo nhan `Dang dong bo/Da dong bo` khoi bang `Tong quan > Du lieu chuyen gan day` vi bang nay dung de xuat anh bao cao. Trang thai dong bo van xem o `Nhat ky giao dich vua thuc hien` va `Cai dat > Trang thai dong bo`, khong chen vao anh xuat.
- Ngay 2026-07-07 bat dau buoc Sheet -> Supabase gan realtime cho chinh sua/xoa tay trong Google Sheet Van tai: them trigger cai bang `installTransportSheetSyncTrigger()` voi 2 handler `handleTransportSheetEdit(e)` va `handleTransportSheetChange(e)`. Handler chi xu ly cac sheet `NL_*`, sync `manage_data_bundles.recent_500`, cache thang lien quan neu biet dong sua hoac 2 thang gan nhat neu la onChange/xoa dong, va sync dashboard khi `NL_VanChuyen` doi. Da `clasp push -f`, test `clasp run syncTransportSheetChange -p '["MANUAL_TEST","NL_VanChuyen"]'` thanh cong `synced=4`, months `2026-07`,`2026-06`, `failed=0`; da cai trigger vao spreadsheet Van tai `1VSNLz...` voi `installed=2`, `removed=0`; da deploy Apps Script production `@230`; test HTTP production `getSupabaseSyncStatus&module=manage` tra `ok=true` va co `transport_sheet_change:NL_VanChuyen`. Muc tieu la giam do tre khi sua/xoa tay tren Sheet ma khong bat lai quet full/backfill nang.
- Ngay 2026-07-07 sau test user: nhap web app hien ngay ok, nhung xoa tay trong `NL_VanChuyen` van hien dong cu va co trang thai `Da dong bo`/`Cho cache`. Nguyen nhan: frontend dang khoi phuc ca job `synced` tu `write_jobs` va overlay vao bang Van hanh/Tong quan, nen dong vua ghi co the song lai tu job log du da xoa trong Sheet; them vao do trigger `onChange` khi xoa dong co the khong tra active sheet. Da sua frontend chi overlay job `pending`/`processing`/`failed`, khong overlay `synced`; job `synced` chi con trong nhat ky. Da sua `handleTransportSheetChange(e)` fallback khi khong biet sheet: sync `recent_500` cua `NL_VanChuyen`, 2 thang gan nhat cua `NL_VanChuyen`, va dashboard; ghi `sync_status` key `transport_sheet_change:unknown`. Them ham test `syncUnknownTransportSheetChange(eventType)` de chay fallback bang `clasp run`. Test fallback ban dau sync tat ca `NL_*` thanh cong nhung mat gan 2 phut nen da thu hep ve `NL_VanChuyen`; test lai `MANUAL_UNKNOWN_CHANGE_LIGHT_TEST` thanh cong `synced=4`, `failed=0`. Da `clasp push -f` va deploy Apps Script production `@231`.
- Ngay 2026-07-07 tiep tuc buoc 3b write queue v2: mo rong queue tu `transport/submitRows` sang `transport/saveSheetRow` va `transport/deleteSheetRow` cho rieng cac sheet `NL_*`. API frontend van goi `saveSheetRow`/`deleteSheetRow` nhu cu; backend chi enqueue khi sheet la `NL_*`, con `DM_*` van ghi truc tiep va sync danh muc nhu truoc. Frontend Van hanh cap nhat lac quan: sua dong thi thay tam dong cu bang rowData moi, xoa dong thi an tam dong khoi bang; cac dong pending bi khoa sua/xoa va poll `write_jobs` de reload lai tu nguon that khi `synced`. Da build `index.html`, `clasp push -f`, test worker `clasp run processWriteJobs -p '[1]'` tra `{ processed: 0, ok: true }`, va deploy Apps Script production `@232`.
- Ngay 2026-07-07 user test sua dong Van hanh qua queue: Sheet da sua thanh cong, Tong quan cap nhat, nhung bang Van hanh bao loi `Bạn không thể đặt định dạng số của các ô trong một cột đã nhập`. Nguyen nhan: `SheetService.saveSheetRow()` van goi `applyFormatsSafely_()` sau khi ghi, Google Sheets co the nem loi voi smart chip/typed column du gia tri da ghi xong. Da bo call apply format sau `saveSheetRow`, giong cach da xu ly cho luong nhap moi; chi giu ghi gia tri va clear cache. Da `clasp push -f`, test `clasp run processWriteJobs -p '[3]'` tra `{ processed: 0, ok: true }`, va deploy Apps Script production `@233`.
- Ngay 2026-07-07 user mo lai menu Van hanh van thay loi format. Kiem tra production `readManageData&sheetName=NL_VanChuyen` tra `ok=true`, job `saveSheetRow` moi nhat da `synced`, `lastError` rong; suy ra loi con lai den tu Supabase/session cache cu co payload `{ok:false,error:...}`. Da sync lai cache bang `clasp run syncTransportSheetChange -p '["REPAIR_MANAGE_CACHE","NL_VanChuyen"]'` thanh cong `synced=4`, `failed=0`. Da sua frontend `readSupabasePayload()` reject payload `ok:false` de fallback Apps Script, va `getCachedSheetData()` tu xoa session cache loi `ok:false`.
- Ngay 2026-07-07 user test xoa Van Chuyen: bang Van hanh an dong ngay, nhung `Tong quan > Du lieu chuyen gan day` cham mat vai phut do chi doi dashboard cache. Da them metadata `previousRowData`/`rowData` vao job `transport/saveSheetRow` va `transport/deleteSheetRow`; frontend dashboard dung pending job de tam thoi an dong bi xoa hoac thay dong cu bang dong sua trong `Dữ liệu chuyến gần đây`, sau khi job `synced` van reload nguon that nhu cu. Da build `index.html`, `clasp push -f`, test worker `{ processed: 0, ok: true }`, va deploy Apps Script production `@234`.
- Ngay 2026-07-07 trien khai buoc on dinh/do quan sat tiep theo: them action `getReportCacheAudit` so sanh `report_bundles.payload` voi bundle live tu Google Sheet cho `05/2026`, `06/2026`, `07/2026`, `Tất cả` sau khi bo tru truong volatile `updatedAt`; man hinh `Cai dat > Trang thai dong bo` hien 3 nhom `Cache Supabase`, `Write queue Van hanh`, va `Audit Bao cao`, gom ca nut retry cho job failed. Audit ban dau phat hien `05/2026` stale, da chay `syncReportBundleToSupabase('05/2026')`; audit lai 4 ky deu `ok=true`. Test `getSupabaseSyncStatus` ok, `getRecentWriteJobs` tra cac job gan day deu `synced`/`lastError` rong, `processWriteJobs(1)` processed 0. Da cai lai trigger Van tai bang `installTransportSheetSyncTrigger()` (removed 2, installed 2) va test `syncTransportSheetChange('POST_PLAN_TEST','NL_VanChuyen')` synced 4 cache, failed 0, months `2026-07`,`2026-06`. Da `clasp push -f` va deploy Apps Script production `@235 - Sync status audit and queue observability`.
- Ngay 2026-07-07 user test thao tac pending: tag chu `Cho Sheet` trong cot `Thao tac` cua bang Van hanh che nut sua/xoa. Da doi thanh icon spinner compact trong cot thao tac; neu job failed hien icon canh bao co the bam retry. Dong pending chua co `rowIndex` that van khong cho sua/xoa de tranh ghi nham dong Google Sheet. Da deploy Apps Script production `@237 - Use compact pending action icon` va push Vercel commit `b1dee89`.
- Ngay 2026-07-07 tiep tuc buoc on dinh queue/cache Van hanh: them action `getManageCacheAudit` so sanh `manage_data_bundles.recent_500` voi 50 dong live moi nhat tu Google Sheet cho cac sheet `NL_*`. Man hinh `Cai dat > Trang thai dong bo` them nhom `Audit Van hanh`; mac dinh chi audit sheet Van hanh dang chon de nhanh, bam `Lam moi` moi audit toan bo va chay them audit Bao cao nang. Test `getManageCacheAudit()` cho 6 sheet `NL_VanChuyen`, `NL_TaiXe`, `NL_Dau`, `NL_ChamCong`, `NL_Phat`, `NL_NghiVanHanh` deu `ok=true`; test rieng `getManageCacheAudit('NL_VanChuyen')` cung `ok=true`.
- Ngay 2026-07-07 user hoi tac dung Audit va vi sao `Trang thai dong bo` load lau. Da tach audit khoi lan tai mac dinh: khi mo `Cai dat > Trang thai dong bo` chi goi nhanh `getSupabaseSyncStatus` va `getRecentWriteJobs`; them 2 nut rieng `Kiem tra Van hanh` goi `getManageCacheAudit` va `Kiem tra Bao cao` goi `getReportCacheAudit`. Nut `Lam moi` trong card nay chi tai lai trang thai nhanh, khong chay audit nang. Da build, `clasp push -f`, test `processWriteJobs(1)` ok, deploy Apps Script production `@239 - Split sync audits from quick status`.
- Ngay 2026-07-07 user hoi audit 50 dong co bat duoc sai lech dong 51 khong. Cau tra loi: khong, audit 50 chi la quick check cho cac thao tac moi. Da them tham so `limit` cho `getManageCacheAudit(sheetNames, limit)` toi da 500 dong va them nut `Kiem tra sau` tren man hinh Trang thai dong bo de so toan bo pham vi `recent_500` cua sheet Van hanh dang chon. Test `getManageCacheAudit('NL_VanChuyen', 50)` va `getManageCacheAudit('NL_VanChuyen', 500)` deu `ok=true`; `processWriteJobs(1)` ok; deploy Apps Script production `@240 - Add deep manage cache audit`.
- Ngay 2026-07-07 user yeu cau phu tinh nang sang cac sheet `NL_Dau`, `NL_TaiXe`, `NL_ChamCong`, `NL_Phat`, `NL_NghiVanHanh` truoc khi chuyen sang Quy. Kiem tra lai code: queue v2 da ap dung cho toan bo `NL_*` qua `submitRows`, `saveSheetRow`, `deleteSheetRow`; UI pending/optimistic dung chung `FORM_SHEET_MAP`; sync cache dung `syncTransportAfterWrite()` theo `sheetName`. Da them nut `Kiem tra tat ca` de audit sau 500 dong cho toan bo `NL_*`. Test `getManageCacheAudit('', 500)` tra `ok=true` cho 6 sheet `NL_VanChuyen`, `NL_TaiXe`, `NL_Dau`, `NL_ChamCong`, `NL_Phat`, `NL_NghiVanHanh`; `processWriteJobs(1)` processed 0. Da deploy Apps Script production `@241 - Add all manage deep audit`. Buoc tiep theo: chuyen sang menu Quy/Thu chi, nhung can thiet ke queue rieng cho `fund` thay vi tai su dung module `transport`.
- Ngay 2026-07-07 user hoi Supabase-first co lam so lieu Bao cao/doanh thu doi ngay khong. Kiem tra thay worker queue fast mode chi sync `manage_data` va dashboard, chua sync `report_bundles` thang lien quan. Da them `syncTransportReportsAfterWrite(sheetName, rows, { includeAll: true })`: sau khi job `submitRows`/`saveSheetRow`/`deleteSheetRow` ghi Google Sheet thanh cong, worker sync hep `report_bundles` cho cac thang lay tu payload (`date`, `fromDate`, `Ngày`, `Từ ngày`, v.v.) va sync them `Tất cả`; neu khong xac dinh duoc thang thi fallback 2 thang bao cao gan nhat. Test `syncTransportReportsAfterWrite('NL_VanChuyen', [{'Ngày':'2026-07-07'}])` thanh cong `synced=2`, months `2026-07`, gom `report:2026-07` va `report:Tất cả`; `processWriteJobs(1)` processed 0. Da deploy Apps Script production `@242 - Sync transport reports after queued writes`.
- Ngay 2026-07-10 da trien khai trong source code (chua migrate/deploy production) dot on dinh + bao mat: migration `006_write_queue_hardening.sql` them atomic RPC `claim_write_jobs`, worker/idempotency fields; append Van hanh dung Developer Metadata `WRITE_JOB_ID`; queued save kiem tra dong cu; queued delete bat buoc `columnsToClear`, con xoa nguyen dong chay truc tiep de tranh retry xoa nham.
- Da them migration `007_auth_hardening.sql` tao allowlist `app_users` va `008_authenticated_read_cutover.sql` thu hoi anon read sau khi auth san sang; frontend dang nhap bang username/password voi email ky thuat an, Vercel proxy `/api/app`, va Apps Script `SecurityService`. Auth chi duoc bat sau khi da cau hinh day du bang `VITE_AUTH_ENABLED=true` va Script Property `AUTH_ENFORCEMENT_ENABLED=true`/`APP_PROXY_SECRET`.
- Da them pilot queue `fund/addFundTransactions`: voucher duoc tao va luu on dinh trong job, retry doi chieu voucher, frontend hien dong pending nhung khong cong vao KPI. Flag `ASYNC_FUND_TRANSACTION_ADD_ENABLED=false` mac dinh; sua/xoa Thu chi, vay no va danh muc van ghi truc tiep.
- Da them `npm test` contract/syntax tests. Test local ngay 2026-07-10: 4/4 pass, build pass; auth gate mobile 375x812 khong overflow, CTA 48px, focus dung.
- Ngay 2026-07-10 da rollout production: Supabase migrations `005`-`008` deu remote; tao tai khoan noi bo `ngotuong` role `admin`; cap nhat day du Vercel env; Apps Script push/deploy `@244`; Vercel production alias `https://dongbac.vercel.app` hien form username/password. Da bat `AUTH_ENFORCEMENT_ENABLED=true` va Script Property `ASYNC_FUND_TRANSACTION_ADD_ENABLED=true`.
- Kiem tra production thanh cong: dang nhap Supabase bang tai khoan `ngotuong`; `/api/app?action=authSession` tra username `ngotuong`, role `admin`; proxy tai startup co du lieu; goi truc tiep Apps Script bi chan; anon REST Supabase tra HTTP 401; worker `processWriteJobs(1)` ok/processed 0. Mat khau khoi tao duoc ban giao rieng, khong commit vao repo.

## File tài liệu hiện hành

- `AGENTS.md`: quy tac lam viec bat buoc cho Codex.
- `PROJECT_CONTEXT.md`: file nay, dung de tiep tuc boi canh/lộ trình giua cac cuoc tro chuyen.
- `PROJECT_SCHEMA.md`: schema/ban do chi tiet Google Sheet, Apps Script, frontend.
- `SUPABASE_SCHEMA.md`: schema Supabase va mapping cache.
- `SUPABASE_SETUP.md`: huong dan lay key, dat bien moi truong, setup trigger.
- `WORKFLOW.md`: quy trinh hang ngay khi sua frontend, Apps Script, Supabase, deploy, rollback.
- `ROLLBACK.md`: cach rollback Supabase/cache/code.
- `README.md`: gioi thieu ngan va lenh deploy nhanh.

## Auth va phan quyen tai khoan (Ngay 2026-07-11)

- Them role `shareholder`: chi xem Tong quan/Bao cao, cac bang trong menu Van hanh, chi tiet giao dich Thu chi va Khoan vay; khong duoc them/sua/xoa, audit queue hoac quan tri tai khoan.
- Vercel API proxy la lop phan quyen bat buoc; UI an nut ghi chi la lop UX thu hai. Migration `009_shareholder_role.sql` mo rong constraint role va them `updated_at` cho `app_users`.
- `Cai dat` co doi mat khau bang mat khau hien tai; `admin` co them tao tai khoan, chon role, bat/tat tai khoan va dat lai mat khau tam. `operator` van duoc doc/ghi nghiep vu nhung khong quan ly tai khoan.
- Bo card `Cau hinh duong dan Web App`; production chi goi proxy `/api/app`, khong cho thay URL backend bang `localStorage`.
- Bo card va logic Dark mode, production chi dung light mode. App luu username sau lan dang nhap thanh cong va dung Supabase persistent session; mat khau khong luu tho, de password manager cua trinh duyet tu dien qua `autocomplete`.
- Mat khau do nguoi dung dat chi can toi thieu 6 ky tu, khong bat buoc chu hoa/ky tu dac biet. Input/select trong Cai dat tren mobile co font 16px va min-height 48px de tranh iPhone auto zoom.

## Doi soat Khoan vay (Ngay 2026-07-11)

- Phat hien dong tat toan Quang Quan 5.752.000 ngay 20/06 ghi ma `260622145004`, trong khi ma vay con lai ngay 25/05 la `260704114143`; logic cu chi ghep chinh xac theo ma nen hien sai con no.
- `FundService` nay uu tien ghep ma chinh xac; dong tra no co ma khong ton tai chi duoc doi soat khi co dung mot khoan vay cung doi tac, phat sinh truoc ngay tra va so du khop hoan toan so tien tra.
- Da xac nhan hai ma `260622145024` va `260704114143` deu borrowed 5.752.000, principalPaid 5.752.000, outstanding 0. Cache version tang `fund_v7`; sync lai 13 fund bundles thanh cong, failed 0.
- UI Chi tiet khoan vay va Lich su vay/tra hien them cot Ma vay; lich su dung ma da doi soat va giu `reconciledFromCode` de truy vet ma ghi nhan ban dau.
- Sau khi user danh gia lai khong gian bang, da bo cot Ma vay khoi UI nhung van giu `loanKey`/`reconciledFromCode` noi bo. Khi xem thang lich su, cot so du van la du no tai cuoi thang; nut Thanh toan chi hien neu khoan vay hien tai con no. Khoan da tra sau thang dang xem hien nhan `Da tat toan dd/MM/yyyy` de tranh thanh toan lap va tranh hieu nham.

## Lo trinh tiep theo

### Phase 4 refactor safety-first (Ngày 2026-07-11)

- Step 1-6 đã bổ sung characterization/contract fixtures cho API-RBAC, cache key, báo cáo, ghi Google Sheet và queue lifecycle mà không đổi runtime.
- Step 7 tách phép chuẩn hóa `clean_()` dùng chung sang `NormalizationUtils.gs`; wrapper cũ được giữ nguyên tại các service để không đổi call site hoặc hành vi.
- Step 7 đã pass 54/54 test, build thành công, deploy Apps Script production `@249` và smoke test `health` thành công.
- Step 8 tách Supabase REST/RPC transport sang `SupabaseHttpClient.gs`, giữ compatibility wrapper trong `SupabaseService`; chưa tách repository của Step 9.
- Step 8 đã pass 62/62 test, build thành công, deploy Apps Script production `@250`; smoke test `health` và `getSupabaseSyncStatus(1)` đều thành công.
- Step 9 tách bundle persistence sang `SupabaseBundleRepository.gs` và `sync_status` sang `SupabaseSyncStatusRepository.gs`; orchestration/public sync functions vẫn ở `SupabaseService`.
- Step 9 đã pass 66/66 test, build thành công, deploy Apps Script production `@251`; smoke test `health` và `getSupabaseSyncStatus(1)` đều thành công.
- Step 10 tách pure cache-audit normalization/hash/result formatting sang `CacheAuditService.gs`; live Sheet/Supabase reads vẫn ở `SupabaseService`.
- Step 10 đã pass 72/72 test, build thành công, deploy Apps Script production `@252`; smoke test `health` và `getManageCacheAudit(['NL_VanChuyen'], 1)` đều thành công.
- Step 11 đã tách chunked runtime cache, cache-key assembly và batch invalidation sang `RuntimeCacheService.gs`; `SheetService` giữ compatibility wrappers và nguyên TTL/key/version/invalidation behavior.
- Step 11 đã pass 78/78 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@253 - Refactor Step 11 extract runtime cache service`.
- Smoke production Step 11 thành công: HTTP `health`, Execution API `health` và `invalidateCaches` đều trả `ok=true`, cache version giữ nguyên `v13`.
- Step 12 tách row-segment write, formula/format preservation, ensure rows và last-non-empty-row helper sang `SheetWritePreserver.gs`; `SheetService` giữ compatibility wrappers và nguyên mapping/orchestration ghi.
- Step 12 đã pass 80/80 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@254 - Refactor Step 12 extract sheet write preserver`.
- Smoke production Step 12 thành công: HTTP/Execution API `health` trả `ok=true`; `readSheetData('NL_VanChuyen', '', '', 1)` trả đúng 7 header, một dòng có `rowIndex` và `ok=true`. Không chạy write test trên Sheet production.
- Step 13 chuyển catalog needs/read/mapping payload Vận tải sang implementation thật trong `CatalogService.gs`; cache orchestration vẫn ở compatibility wrapper `SheetService.getCatalogs()`, generic catalog CRUD giữ nguyên.
- Step 13 đã pass 83/83 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@255 - Refactor Step 13 implement transport catalog facade`.
- Smoke production Step 13 thành công: `health`, catalog `vanChuyen`, `chamCong`, full catalog và virtual display `DM_ThamSo_TS`/`DM_ThamSo_GD` đều trả `ok=true`/đúng payload shape; không ghi dữ liệu production.
- Step 14 chuyển generic/manage read, header/date range/limit/order/row serialization sang implementation thật trong `SheetReadService.gs`; `SheetService.readSheetData()` chỉ còn compatibility adapter truyền spreadsheet/cache/config context. Update/delete không thay đổi.
- Step 14 đã pass 87/87 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@256 - Refactor Step 14 implement transport read manage facade`.
- Smoke production Step 14 thành công: HTTP/Execution API `health`, recent read cho cả sáu `NL_*` và date-range `NL_VanChuyen` đều trả `ok=true`, đúng header/rowIndex/order/isLimited; không ghi dữ liệu production.
- Step 15 chuyển validation/append orchestration, `WRITE_JOB_ID` replay, formula skip và cache invalidation callback của `submitRows` sang implementation thật trong `EntryService.gs`; `SheetService.submitRows()` chỉ còn compatibility adapter. Reconciliation và generic save/delete chưa thay đổi.
- Step 15 đã pass 91/91 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@257 - Refactor Step 15 implement transport entry facade`.
- Smoke production Step 15 thành công: HTTP/Execution API `health`, recent read `NL_VanChuyen` trả `ok=true`; submit payload rỗng bị chặn đúng với `Chua co dong nao de ghi.` trước khi tạo job/ghi Sheet. Không chạy write test production.
- Step 16 tách read/aggregate trip pairs, compare submitted rows và warning formatting sang `TransportReconciliationService.gs`; `EntryService` và compatibility `SheetService` delegate trực tiếp. Không đổi threshold, quyền hoặc công thức Sheet.
- Step 16 đã pass 94/94 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@258 - Refactor Step 16 extract transport reconciliation service`.
- Smoke production Step 16 thành công: HTTP/Execution API `health` trả `ok=true`; reconciliation payload rỗng và một cặp ngày/xe read-only đều trả array hợp lệ, không ghi dữ liệu production.
- Step 17 tách lifecycle sheet tạm báo cáo sang `ReportTempSheetService.gs` và version/read/write `SYS_ReportCache` sang `SheetReportCacheRepository.gs`; report parser/output/controller semantics vẫn ở `SheetService`.
- Step 17 đã pass 98/98 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@259 - Refactor Step 17 extract report temp sheet cache infrastructure`.
- Smoke production Step 17 thành công: report bundle `07/2026` và `Tất cả` trả đầy đủ; audit hai kỳ `status=ok` với live/cache hash khớp; cleanup temp trước/sau đều `count=0`, `BC_TongQuan!B1` gốc không bị mutation theo test contract.
- Audit tài liệu sau Step 11-17 đã xác nhận checkpoint nằm trong `PROJECT_CONTEXT`, ownership/API contracts của Step 13-17 đã cập nhật; bổ sung `PLATFORM_SHEET_INFRA` cho `RuntimeCacheService`/`SheetWritePreserver`, xóa ownership reconciliation cũ bị lặp và sửa handoff stale từ Step 12 sang Step 18.
- Step 18a tách active/selected month resolution, month-table KPI parsing và detail KPI parsing thuần sang `DashboardService.gs`; `SheetService` giữ compatibility wrappers. Detail aggregation, report tables và latest trips chưa chuyển.
- Step 18a đã pass 99/99 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@260 - Refactor Step 18a extract dashboard month KPI parsing`.
- Smoke production Step 18a thành công: dashboard và report bundle `07/2026` trả đầy đủ; audit `07/2026`/`Tất cả` đều `status=ok`, live/cache hash giữ nguyên.
- Step 18b tách pure detail matrix aggregation và format tổng hợp sang `DashboardService.gs`; cache/temp-sheet/Sheet read vẫn giữ nguyên.
- Step 18b đã pass 99/99 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@261 - Refactor Step 18b extract detail aggregation`.
- Smoke production Step 18b thành công: report bundle `Tất cả` trả đầy đủ; audit `07/2026`/`Tất cả` đều `status=ok`, hash giữ nguyên; cleanup temp `count=0`.
- Step 18c tách read matrix `BC_BangLuong`/`BC_TongHopXe` và filter tháng/`Tất cả` sang `ReportTableService.gs`; cache key/TTL vẫn ở `SheetService`.
- Step 18c đã pass 102/102 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@262 - Refactor Step 18c extract report table service`.
- Smoke production Step 18c thành công: payroll/vehicles `07/2026` trả đúng header width 16/12 và dữ liệu lọc; audit `07/2026`/`Tất cả` đều `status=ok`, hash giữ nguyên.
- Step 18d tách latest-trips read/serialization và dashboard payload assembly sang `DashboardService.gs`; `SheetService` giữ compatibility adapters, cache orchestration, report links và các Sheet overview/input readers hiện hữu.
- Step 18d đã pass 105/105 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@263 - Refactor Step 18d extract dashboard latest trips`.
- Smoke production Step 18d thành công: HTTP/Execution API `health` trả `ok=true`; dashboard trả đúng payload và latest trips ngày `04/07/2026`; audit `07/2026`/`Tất cả` đều `status=ok`, live/cache hash giữ nguyên. Toàn bộ Step 18 đã hoàn thành.
- Step 19a tách startup/catalog bundle upsert, stable key/status assembly, full-sync target orchestration và catalog after-write sync sang `StartupCatalogSyncService.gs`; `SupabaseService` giữ nguyên public facade, realtime tick và call sites hiện hữu.
- Step 19a đã pass 109/109 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@264 - Refactor Step 19a extract startup catalog sync service`; không cần migration/schema change.
- Smoke production Step 19a thành công: `health` trả `ok=true`; `syncAllStartupAndCatalogsToSupabase()` sync đủ 17 bundle, failed 0; `sync_status` có 1 startup key và 16 catalog keys, tất cả `status=ok`.
- Step 19b tách report/dashboard bundle upsert, report month discovery/resolution và transport report-after-write month selection sang `ReportSyncService.gs`; `SupabaseService` giữ public facade, realtime tick, worker và audit call sites.
- Step 19b đã pass 113/113 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@265 - Refactor Step 19b extract report sync service`; không cần migration/schema change.
- Smoke production Step 19b thành công: `health` và dashboard sync `__dashboard_latest__` đều `ok`; report-after-write chọn đúng `2026-07`, sync 2 target `07/2026`/`Tất cả`, failed 0; audit hai kỳ đều `status=ok`, live/cache hash giữ nguyên.
- Step 19c tách manage recent/month bundle upsert, month discovery, full-sync targets và transport sheet-change/fallback scope/lock sang `ManageSyncService.gs`; `SupabaseService` giữ public facade, trigger installation/event adapters, worker và audit call sites.
- Step 19c đã pass 117/117 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@266 - Refactor Step 19c extract manage sync service`; không cần migration/schema/trigger change.
- Smoke production Step 19c thành công: recent `NL_VanChuyen`, `month:2026-07` và sheet-change `NL_TaiXe` đều `ok`; sheet-change sync đúng recent + `2026-07`/`2026-06`, failed 0; audit 50 dòng `NL_VanChuyen`/`NL_TaiXe` đều `status=ok`, live/cache hash khớp.
- Step 19d tách Fund overview/transaction/loan/catalog bundle upsert, stable keys/status, full-sync, month discovery/fallback/payload parsing và after-write month selection sang `FundSyncService.gs`; `SupabaseService` chỉ giữ public facade/context, feature flags, queue/worker và realtime orchestration.
- Step 19d hoàn thiện đã pass 121/121 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@269 - Finalize Step 19d fund sync ownership`; không cần migration/schema change.
- Smoke production Step 19d hoàn thiện thành công: `health` trả `ok=true`; `syncAllFundBundlesToSupabase('2026')` chạy 13 bước, ba tháng `2026-07`/`2026-06`/`2026-05`, failed 0; đủ 18 `sync_status` Fund đều `ok`. Toàn bộ Step 19 đã hoàn thành.
- Step 20 tách `write_jobs`/`write_job_logs` persistence, idempotency lookup, job/recent reads, retry patches, lifecycle logs và row normalization sang `WriteJobRepository.gs`; RPC `claim_write_jobs` và worker/action execution vẫn ở `SupabaseService`.
- Step 20 đã pass 125/125 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@270 - Refactor Step 20 extract write job repository`; không cần migration/schema change.
- Smoke production Step 20 read-only thành công: `health` trả `ok=true`; `getWriteJobStatus('step20-smoke-nonexistent')` giữ đúng contract `{ok:false,error:'Không tìm thấy job: ...'}`. Không enqueue, retry hoặc chạy worker trên production.
- Step 21a tách batch limit, worker ID, atomic RPC claim parameters, per-job lifecycle transitions, retry timing và worker response assembly sang `WriteJobWorker.gs`; transport/fund action execution vẫn ở `SupabaseService` cho Step 21b/21c.
- Step 21a đã pass 129/129 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@271 - Refactor Step 21a extract write job worker lifecycle`; không cần migration/schema change.
- Smoke production Step 21a thành công: `health` trả `ok=true`; `processWriteJobs(1)` trả `processed=0`, `ok=true`, `results=[]`, xác nhận worker idle và không ghi dữ liệu nghiệp vụ.
- Step 21b tách queued Transport actions `submitRows`/`saveSheetRow`/`deleteSheetRow`, replay metadata, physical-delete guard và manage/dashboard/report sync scopes sang `TransportJobHandler.gs`; Fund action vẫn ở `SupabaseService` cho Step 21c.
- Step 21b đã pass 134/134 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@272 - Refactor Step 21b extract transport job handler`; không cần migration/schema change.
- Smoke production Step 21b thành công: `health` trả `ok=true`; `processWriteJobs(1)` trả `processed=0`, `ok=true`, không enqueue hoặc ghi thử trên Sheet production.
- Step 21c tách queued `fund/addFundTransactions`, replay metadata, write-result validation và Fund cache-after-write isolation sang `FundJobHandler.gs`; `SupabaseService.executeWriteJob_` chỉ còn dispatch Transport/Fund và unsupported-action guard.
- Step 21c đã pass 138/138 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@273 - Refactor Step 21c extract fund job handler`; không cần migration/schema change.
- Smoke production Step 21c thành công: `health` trả `ok=true`; `processWriteJobs(1)` trả `processed=0`, `ok=true`; không enqueue hoặc ghi thử giao dịch Fund production. Toàn bộ Step 21 đã hoàn thành.
- Step 22a tách Sheet read/header lookup sang `FundTransactionRepository.gs` và mapping/filter/sort/limit giao dịch sang `FundTransactionService.gs`; `FundService.getFundTransactions()` giữ public facade và cache orchestration. Luồng ghi/voucher/rollback chưa chuyển trong lát cắt này.
- Step 22a đã pass 142/142 test, build thành công, diff build sạch và deploy Apps Script production `@274 - Step 22a - Fund transaction read extraction`; không cần migration/schema change.
- Smoke production Step 22a read-only thành công: `health` trả `ok=true`; `getFundTransactions('2026', {month:'2026-07',limit:5})` trả đúng `NHAP_THUCHI`, đủ month list, `totalRows=67`, `limited=true` và 5 giao dịch mới nhất. Không ghi dữ liệu production.
- Step 22b tách validate/build row, stable voucher generation usage, voucher replay/partial-conflict orchestration và append A:J + format B/F + helper formulas M:N sang `FundTransactionService.gs`/`FundTransactionRepository.gs`; `FundService` giữ public facade, spreadsheet resolver, lock, cache-version bump và rollback adapter. Update/delete chưa chuyển.
- Step 22b đã pass 146/146 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@275 - Step 22b - Fund transaction append extraction`; không cần migration/schema change.
- Smoke production Step 22b an toàn thành công: `health` trả `ok=true`; worker idle `processed=0`; read-back tháng `2026-07` vẫn trả `totalRows=67` và đúng hai giao dịch mới nhất. Không enqueue hoặc append giao dịch production.
- Step 22c tách update/delete orchestration sang `FundTransactionService.gs`, range update/delete và batch rollback A:N sang `FundTransactionRepository.gs`; `FundService` chỉ giữ public facade, spreadsheet resolver, lock và cache-version bump cho Fund transaction.
- Step 22c đã pass 148/148 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@276 - Step 22c - Fund transaction update delete extraction`; không cần migration/schema change.
- Smoke production Step 22c an toàn thành công: `health` trả `ok=true`; worker idle `processed=0`; read-back tháng `2026-07` vẫn trả `totalRows=67` và đúng hai giao dịch mới nhất. Không update/delete dữ liệu production. Toàn bộ Step 22 đã hoàn thành.
- Step 23a tách managed/native catalog read, named-range spec resolution và encoded native row index sang `FundCatalogRepository.gs`; group normalization, de-dup, option fallback merge, group counts/filter payload sang `FundCatalogService.gs`. `FundService` giữ spreadsheet/cache facade và CRUD/bounds chưa chuyển.
- Step 23a đã pass 152/152 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@277 - Step 23a - Fund catalog read extraction`; không cần migration/schema/named-range change.
- Smoke production Step 23a read-only thành công: `health` trả `ok=true`; form options trả đủ 5 nhóm; `incomeCategories` trả 5 native rows đúng encoded index, group counts `5/18/3/27/2`. Không ghi catalog production.
- Step 23b tách encoded-index parsing, named/native bounds, first-blank append, bounded no-overflow và native/managed CRUD sang `FundCatalogService.gs`/`FundCatalogRepository.gs`; `FundService` chỉ giữ public facade, spreadsheet resolver, lock và cache-version bump.
- Step 23b đã pass 157/157 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@278 - Step 23b - Fund catalog CRUD extraction`; không cần migration/schema/named-range change.
- Smoke production Step 23b an toàn thành công: `health` trả `ok=true`; worker idle `processed=0`; catalog group counts và form options giữ nguyên so với `@277`. Không save/delete catalog production. Toàn bộ Step 23 đã hoàn thành.
- Step 24a hoàn thành điều kiện tiên quyết full loan characterization bằng workbook giả lập local: current/historical overview, exact/safe-orphan/ambiguous/no-balance reconciliation, partial/full settlement, interest, type variants, row mapping, add loan/payment, format B/F, formula N, growth/lock/response và validation errors.
- Step 24a đã pass 165/165 test, build thành công và `git diff --check` sạch. Không đổi runtime nên không tạo Apps Script deployment mới; production vẫn ở `@278`, không có dữ liệu production bị đọc/ghi bởi test.
- Step 24b tách `NHAP_VAY` snapshot read sang `FundLoanRepository.gs`; type normalization, row mapping, exact/safe-orphan reconciliation, current/historical aggregation và history/status mapping sang `FundLoanService.gs`. `FundService.getFundLoanOverview()` giữ cache/resolver facade; Fund overview dùng compatibility loan reader; add loan/payment chưa chuyển.
- Step 24b đã pass 165/165 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@279 - Step 24b - Fund loan read extraction`; không cần migration/schema/UI change.
- Smoke production Step 24b: `health` và `auditFundLoanCase` no-match đều `ok=true`, sync status `ok`. `clasp run getFundLoanOverview` chạy xong nhưng Execution API từ chối serialize payload vì `recentRows.dateObj` là `Date` (contract hiện hữu); không phải service exception. Không ghi dữ liệu production.
- Step 24c tách build/validate loan/payment và filter formula N sang `FundLoanService.gs`; append A:K, row growth, format B/F và set formula N sang `FundLoanRepository.gs`. `FundService` chỉ giữ public facade, spreadsheet resolver, lock và cache-version bump.
- Step 24c đã pass 165/165 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@280 - Step 24c - Fund loan write extraction`; không cần migration/schema/UI change.
- Smoke production Step 24c an toàn thành công: `health` và loan audit no-match `ok=true`; worker idle `processed=0`. Không add loan/payment production. Toàn bộ Step 24 đã hoàn thành.
- Step 25 thêm `ApiActionRegistry.gs` làm registry nội bộ cho action/method/query-command/permission class, gồm public Apps Script, Router-only/disabled và proxy-local metadata. `PublicApi.invokeApi()` và Router GET dùng registry guard nhưng giữ nguyên compatibility `if` handlers, URL/action/payload và proxy enforcement.
- Step 25 đã pass 170/170 test, build thành công, `git diff --check` sạch và deploy Apps Script production `@281 - Step 25 - Internal API action registry`; không cần migration/schema/frontend/proxy deploy.
- Smoke production Step 25 thành công: `invokeApi('GET','health')` và direct `health` đều `ok=true`; `invokeApi('PATCH','health')` giữ đúng lỗi `Phương thức không hợp lệ: PATCH`. Không mutation production.
- Step 26a tách Apps Script envelope forwarding, 1 MB payload guard, upstream POST/redirect/header, non-2xx/invalid-JSON và business-error status mapping sang `api/services/apps-script-client.js`; `/api/app` giữ auth/RBAC/account orchestration và response send.
- Step 26a đã pass 175/175 test, build thành công, `git diff --check` sạch và deploy Vercel production `dpl_HBaedmJa8Mfd5LfNnb5prRqrGtrc`, alias `https://dongbac.vercel.app`; Apps Script vẫn ở `@281`.
- Smoke Step 26a phát hiện/fix public `health` null-user guard trong `assertAuthorized`: production hiện `health=200`, unauthenticated `getDashboard=401`, `PUT health=405`. Upstream/client errors không log hoặc phản chiếu proxy secret.
- Step 26b tách shareholder allowlist, deny-by-default và account admin guard sang `api/services/authorization-policy.js`; `api/app.js` giữ đúng thứ tự authenticate -> authorize -> account/upstream dispatch. Role-value validation cho account mutations chưa chuyển.
- Step 26b đã pass 178/178 test, build thành công, `git diff --check` sạch và deploy Vercel production `dpl_HjEEVJJYg2uQoZ6V4cHm2Je5opip`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 26b: public `health=200`; unauthenticated `getDashboard=401`; unauthenticated `submitRows=401`, không có business write.
- Step 26c tách Supabase JWT/session verification sang `api/services/auth-service.js` và active `app_users` allowlist lookup sang `api/repositories/app-user-repository.js`; `api/app.js` giữ nguyên thứ tự authenticate -> authorize -> account/upstream dispatch. Account CRUD/password orchestration và persistence vẫn ở `api/app.js` cho Step 26d.
- Step 26c đã pass 185/185 test, build thành công, `git diff --check` sạch và deploy Vercel production `dpl_4pERKx7GBMdbxK5sFQtUbxjCpbKq`, alias `https://dongbac.vercel.app`; không cần migration/schema/Apps Script deployment, Apps Script vẫn `@281`.
- Smoke production Step 26c: public `health=200`; unauthenticated `getDashboard=401`; `PUT health=405`. Không có business write và không dùng credential production trong test.
- Step 26d tách account action dispatch, username/role/password validation, Supabase Auth admin/password calls, self-protection và create-user rollback sang `api/services/account-service.js`; mở rộng `api/repositories/app-user-repository.js` để sở hữu list/create/update `app_users`. `api/app.js` chỉ còn composition và authenticate -> authorize -> account/upstream dispatch.
- Step 26d đã pass 194/194 test, build thành công, `git diff --check` sạch và deploy Vercel production `dpl_HUdAiVkqcioNKkR2dgEHMzrPPM8R`, alias `https://dongbac.vercel.app`; không cần migration/schema/Apps Script deployment, Apps Script vẫn `@281`.
- Smoke production Step 26d: public `health=200`; unauthenticated `getDashboard=401`; unauthenticated `listUsers=401`; `PUT health=405`. Không chạy account mutation production; create/list/update/reset/change-password và rollback đã được kiểm tra bằng local unit/contract tests. Toàn bộ Step 26 đã hoàn thành.
- Step 27a tách sáu pure frontend globals `escapeHtml`, `removeAccents`, `parseLocaleNumber`, `formatTableDate`, `formatIsoDateForDisplay`, `parseDisplayDateToIso` sang `client_utils.html`, được include trước config/API và giữ nguyên tên/call site/output. DOM/cursor/date-picker utilities vẫn ở `client_ui.html`.
- Step 27a đã pass 199/199 test, build thành công, không còn Apps Script template tag trong artifact, `git diff --check` sạch và deploy Vercel production `dpl_F9KTw4iRFipcsQAM84LGnAZp9Hkb`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 27a: page/health `200`, built artifact có đúng một owner cho utility đã tách, unauthenticated dashboard `401`; browser visual xác nhận auth gate desktop render đúng. Kết nối browser bị ngắt trước mobile viewport/console pass nên hai kiểm tra visual này chưa được tái xác nhận trong lát cắt; không có markup/CSS/text/interaction hoặc backend mutation.
- Step 27b tách Apps Script runtime adapter, backend/proxy URL selection, fetch request/envelope/header/error mapping, `callApi` routing và direct Apps Script network fallback sang `client_api_transport.html`; Supabase token/client/cache và Auth/session vẫn ở `client_api.html` cho các lát cắt kế tiếp. Tên global/call site/payload/error text giữ nguyên.
- Step 27b đã pass 205/205 test, build thành công, artifact không còn template tag, `git diff --check` sạch và deploy Vercel production `dpl_8TyiuFtGWG9REvQvhyZR8zYAS41o`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 27b: page/health `200`, built artifact có đúng một owner cho transport globals, unauthenticated dashboard/listUsers đều `401`. Không chạy business POST và không đổi DOM/CSS/text/interaction.
- Step 27c tách Supabase cache readiness, REST row/payload reads, report/startup/catalog/manage/fund bundle mapping, spreadsheet scope và stable cache-key builders sang `client_supabase_cache.html`; Supabase client/access token/Auth/session và browser sessionStorage cache vẫn ở `client_api.html`. Global names/call sites/table/filter/select/payload giữ nguyên.
- Step 27c đã pass 211/211 test, build thành công, artifact không còn template tag, `git diff --check` sạch và deploy Vercel production `dpl_E2bjf5XBc9UfoCRHj6R4MmK61LpP`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 27c: page/health `200`, built artifact có đúng một owner cho Supabase cache globals, unauthenticated dashboard `401`. Không dùng credential để đọc cache authenticated production; REST URL/header/payload/error/fallback và cache-key parity được kiểm tra local, không có mutation.
- Step 27d tách Supabase config/client singleton, access token, auth gate/inert, remembered username, sign-in/sign-out và authenticated session/allowlist bootstrap sang `client_auth.html`; `client_api.html` chỉ còn browser session cache/invalidation. DOM IDs/text, persistent session options, internal email mapping, role UI và global call sites giữ nguyên.
- Step 27d đã pass 218/218 test, build thành công, artifact không còn template tag, `git diff --check` sạch và deploy Vercel production `dpl_4Qw9GaPFWf8ezXUuiZStf9x6iUPL`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 27d: page/health `200`, auth markup đầy đủ và built artifact có đúng một owner cho Auth globals, unauthenticated `authSession=401`. Không dùng credential production; sign-in/session/allowlist branches được kiểm tra local, không có mutation.
- Step 27e tách immutable navigation, form labels/icons/notes, form-Sheet maps, field schema và Fund page-size constants sang `client_config_constants.html`; toàn bộ mutable application state và stateful UI helpers giữ ở `client_config.html`. Global names, initialization order và schema values giữ nguyên.
- Step 27e đã pass 223/223 test, build thành công, artifact không còn template tag, `git diff --check` sạch và deploy Vercel production `dpl_Bf6fsQ8quEKmkmfsobpmmnUQnYMK`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`.
- Smoke production Step 27e: page/health `200`, built artifact có đúng một owner riêng cho constants và mutable state, unauthenticated `authSession=401`. Không đổi DOM/CSS/text/interaction, không mutation. Toàn bộ Step 27a-27e đã hoàn thành.
- Step 28 tách sync status, cache audit, write-job rendering và format thời gian sang `client_observability.html`; `client_ui.html` giữ loader, toast, drawer và generic UI utilities. Global names, DOM IDs, API parameters, quick/deep/all audit và retry behavior giữ nguyên; mặc định status load không chạy heavy audit.
- Step 28 đã pass 226/226 test, build thành công, artifact không còn template tag và `git diff --check` sạch; commit `cc0e178`. Đã deploy Vercel production `dpl_JEBMfSWsjNBBTXfghFTD2gZSPRG7`, alias `https://dongbac.vercel.app`; Apps Script vẫn `@281`, không cần migration/schema/backend deploy.
- Smoke Step 28 thành công: production page/health `200`, unauthenticated dashboard `401`, artifact có đúng một owner observability; auth gate production và local desktop/mobile 390x844 render đúng, không có console error mới. Không chạy audit/retry hoặc business mutation production.
- Step 29a tách Fund overview/report, KPI growth, category detail và export image sang `client_cashflow_overview.html`; `client_cashflow.html` giữ facade/tab và các submodule còn lại. Global names, DOM, API/cache fallback và interaction giữ nguyên.
- Step 29a đã pass 230/230 test, build thành công và `git diff --check` sạch; commit `c4b1ae5`. Đã deploy Vercel production `dpl_EcffHz9rA8C1P4HXvbUnqxcjSXvV`; page/health `200`, unauthenticated dashboard `401`, production artifact có đúng overview globals. Apps Script vẫn `@281`; không backend/schema/API/feature-flag change hoặc business mutation.
- Step 29b tách Fund form options, transaction entry/list/filter/pager, direct/queued submit và pending-row rendering sang `client_cashflow_transactions.html`; pending-job lifecycle vẫn ở facade cho Step 29c. Global names, API/cache/job contracts và UI giữ nguyên.
- Step 29b đã pass 234/234 test, build thành công và `git diff --check` sạch; commit `b2c2ea0`. Đã deploy Vercel production `dpl_CDUy118i1ELu2WFyuLtmzXqcemvi`; page/health `200`, unauthenticated dashboard `401`, artifact có đúng transaction globals. Apps Script vẫn `@281`; không backend/schema/API/feature-flag change hoặc business mutation.
- Step 29c tách restore/poll/retry/lifecycle của pending Fund write jobs sang `client_cashflow_pending.html`; transaction renderer vẫn chỉ overlay pending/processing/failed và loại job khi synced. API/status/poll interval/toast giữ nguyên.
- Step 29c đã pass 238/238 test, build thành công và `git diff --check` sạch; commit `cb3a395`. Đã deploy Vercel production `dpl_Be32N3tPTnZJJnW6jSYwRujmd6YT`; page/health `200`, unauthenticated dashboard `401`, artifact có đúng pending-job globals. Apps Script vẫn `@281`; không backend/schema/API/feature-flag change hoặc business mutation.
- Step 29d tách loan overview/history/filter/pager, add/payment drawers, validation và submit sang `client_cashflow_loans.html`; shared date/money/loader utilities giữ ở facade. Global names, settlement labels/rules, API/cache fallback và UI giữ nguyên.
- Step 29d đã pass 242/242 test, build thành công và `git diff --check` sạch; commit `0d54915`. Đã deploy Vercel production `dpl_H2vfnkzWoFmxdGxxKetzFhVSNTwr`; page/health `200`, unauthenticated dashboard `401`, artifact có đúng loan globals. Apps Script vẫn `@281`; không backend/schema/API/feature-flag change hoặc business mutation.
- Step 29e tách Fund catalog read/filter/CRUD/status sang `client_cashflow_catalog.html`; facade còn tab routing và shared date/money/loading utilities. Global names, permissions, row token, API/cache fallback và UI giữ nguyên.
- Step 29e đã pass 246/246 test, build thành công và `git diff --check` sạch; commit `7f2e102`. Đã deploy Vercel production `dpl_5D9Zpafspm15jySiL8zsp3Mt83uH`; page/health `200`, unauthenticated dashboard `401`, artifact có đúng catalog globals. Final visual QA auth gate desktop/mobile 375x812 không có console error mới. Apps Script vẫn `@281`; không backend/schema/API/feature-flag change hoặc business mutation. Toàn bộ Step 29a-29e đã hoàn thành.
- Step 30 tạo `client_pending_job_store.html` làm owner duy nhất của pending Transport/Fund state, với read/replace/upsert/update/remove/mergeRecent/subscribe và compatibility globals `pendingWriteJobs`/`pendingFundWriteJobs`. Transport/Fund mutations delegate vào store; Dashboard/Manage/Transactions consumers giữ call site cũ.
- Step 30 đồng bộ lại `client.html` HtmlService include graph với các fragment Step 28-30 để giữ compatibility. Step 30 đã pass 251/251 test, build thành công và `git diff --check` sạch; commit `d087ae1`. Đã deploy Vercel production `dpl_Eg3FRMBiz5EkuC7SH8FsfkyAmQ7Z`; page/health `200`, unauthenticated dashboard `401`, artifact có store cùng Transport/Fund delegates. Visual QA auth gate desktop/mobile 375x812 không có console error mới. Apps Script vẫn `@281`; không đổi polling/status/overlay/API/backend/schema/feature flag hoặc business mutation.
- Step 31 bổ sung Next.js static shell chạy song song tại `/next-accounts/`, React Accounts island cho route Cài đặt hiện hữu và typed account client giữ nguyên năm proxy-local actions. Markup/label/field/validation/RBAC boundary được characterization test; legacy `client_accounts.html` vẫn tồn tại và bridge chỉ mount React khi `REACT_ACCOUNTS_ENABLED`/`VITE_REACT_ACCOUNTS_ENABLED` bật. Flag mặc định tắt, vì vậy production tiếp tục dùng Accounts legacy và có thể rollback tức thời bằng flag/Vercel rollback. Không đổi account API, backend, schema, Google Sheet hoặc business data.
- Step 31 đã pass 257/257 test, full legacy + React + Next static build thành công, `git diff --check` sạch; commit `446f78b`. Đã deploy Vercel production `dpl_ENM9UszKPanmvb55aj4mBKiSJUuF`, alias `https://dongbac.vercel.app`; page/health, `/next-accounts/` và React bundle đều `200`, unauthenticated dashboard `401`, production artifact xác nhận flag rỗng/tắt và legacy root còn active. Visual QA shell desktop 1280x720/mobile 375x812 không có console warning/error hoặc tràn ngang. Apps Script vẫn `@281`; không chạy account/business mutation.
- Step 32 bổ sung React Sync Status/Audit island và Next static canary route `/next-accounts/observability/`. Typed observability client giữ chính xác status limit 24, Transport jobs limit 12, quick/deep/all audit 50/500 dòng, report months cố định và retry action; default load không chạy audit nặng. `REACT_OBSERVABILITY_ENABLED`/`VITE_REACT_OBSERVABILITY_ENABLED` mặc định tắt độc lập, legacy `client_observability.html` và markup vẫn tồn tại để rollback. Không đổi API/backend/schema/Sheet hoặc queue behavior.
- Step 32 đã pass 262/262 test, full legacy + hai React island + Next static build thành công, `git diff --check` sạch; commit `4283600`. Đã deploy Vercel production `dpl_8JCGdpHU8wNxqJbzZP88aQtmGye3`, alias `https://dongbac.vercel.app`; page/health, `/next-accounts/observability/` và Observability bundle đều `200`, unauthenticated dashboard `401`, production artifact xác nhận flag rỗng/tắt và legacy root còn active. Visual QA desktop 1280x720, mobile portrait 375x812 và landscape 812x375 có touch target 44px, không tràn ngang hoặc console warning/error. Apps Script vẫn `@281`; không chạy audit/retry/business mutation.
- Step 33a bổ sung React Catalog Vận tải read-only island và Next static canary route `/next-accounts/catalog/`. Slice giữ đủ chín dynamic/virtual sheet tabs, GET `readCatalogData`, `displaySheetName`, `forceRefresh`, dynamic headers và rowIndex rendering qua compatibility implementation; khi canary bật thì không render nút thêm/cột thao tác/sửa/xóa. Filter/pagination, Catalog CRUD Vận tải và Fund Catalog chưa migrate. `REACT_CATALOG_READONLY_ENABLED`/`VITE_REACT_CATALOG_READONLY_ENABLED` mặc định tắt, legacy Catalog vẫn là rollback.
- Step 33a đã pass 267/267 test, full legacy + ba React island + Next static build thành công, `git diff --check` sạch; commit `c27de7c`. Đã deploy Vercel production `dpl_CrmqufZp4prhrDvZM9B7W6KvDqQ6`; page/health, `/next-accounts/catalog/` và Catalog bundle đều `200`, unauthenticated dashboard `401`, flag rỗng/tắt và legacy root active; canary không có write controls. Visual QA desktop 1280x720/mobile 375x812 có 9 tabs, touch target 44px, tab scroll nội bộ, không page overflow hoặc console warning/error. Apps Script vẫn `@281`; không đọc/ghi Catalog production qua canary.
- Step 33b đưa search, trạng thái nhân sự, chủ xe và pagination vào React Catalog markup; behavior vẫn delegate cho `debounceCatalogSearch`, `filterCatalogRows`, `changeCatalogPage`, giữ page size 20 và owner/status rules. Write controls vẫn bị loại khỏi canary. Đã pass 268/268 test, full build và `git diff --check` sạch; commit `c97e27a`, Vercel production `dpl_F9RVQBFV4F5fh1Kypc6SLKiJ6mfp`. Page/route/bundle `200`, unauthenticated dashboard `401`; production canary có đủ filter/pagination markup và không có write controls. Apps Script vẫn `@281`, flag mặc định tắt.
- Step 33c thêm flag `REACT_CATALOG_WRITE_ENABLED` độc lập; chỉ khi read + write flags cùng bật thì React Catalog hiện nút thêm và legacy row renderer hiện cột sửa/xóa, giữ nguyên `openCatalogAddModal`, `openManageEditModal(row)`, `deleteManageRow(row.rowIndex)` và proxy permissions. Cả hai flag mặc định tắt. Đã pass 269/269 test, full build và `git diff --check` sạch; commit `885679e`, Vercel production `dpl_8fymuH7Rmav1cVmAarDwBmQaKMPe`. Page/route `200`, unauthenticated dashboard `401`, write flag rỗng/tắt và direct canary không có write controls; không chạy Catalog mutation production.
- Step 33d bổ sung React Fund Catalog island, typed read/save/delete client và Next route `/next-accounts/fund-catalog/`; giữ năm `2026`, năm group keys, rowIndex/value token, fallback-row rule, permission, save/delete/refresh callbacks. `REACT_FUND_CATALOG_ENABLED` mặc định tắt và legacy `client_cashflow_catalog.html` vẫn là rollback. Local verification 272/272 test pass, full build và `git diff --check` sạch; checkpoint production sẽ được ghi sau smoke, không chạy Fund Catalog mutation.

### Cổng phê duyệt hiện tại

- Trạng thái hiện tại: Step 28-32 và Step 33a-33c đã hoàn thành; Step 33d đã hoàn tất local verification và đang chờ production smoke/checkpoint. Apps Script vẫn `@281`; các React flag mặc định tắt.
- Bước kế tiếp sau khi toàn bộ Step 33 deploy ổn định: Step 34 — React/Next.js Reports và Dashboard; không tự bắt đầu nếu chưa có phê duyệt Step 34.
- Từ Step 12 trở đi, user cho phép Agent chủ động deploy và push GitHub sau khi toàn bộ verification của step thành công; vẫn phải dừng nếu test thất bại hoặc có rủi ro/điều kiện production chưa được thỏa mãn.
- Các bước tiếp theo vẫn phải thực hiện độc lập theo `REFACTOR_PLAN.md`.

### 1. Dong bang do dung cua Bao cao

- So sanh `Báo cáo tổng quan` va `Báo cáo chi tiết` tren web voi `BC_TongQuan` trong Google Sheet cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`.
- Khong toi uu them neu chua xac nhan so lieu dung.
- Neu can hien KPI tren card, uu tien lay gia tri tu bang goc/cache dung, khong tu suy dien cong thuc moi.

### 2. Tach sync theo module/thang

- Giam full sync toan cuc vi chay lau; `syncRealtimeCache()` hien la tick nho, `syncFullRealtimeCache()` moi la backfill toan cuc.
- Da bat dau dua duong ghi web app ve cac ham sync nho:
  - report/dashboard thang vua thay doi
  - manage month vua ghi
  - fund transaction month vua ghi
  - startup/catalog chi sync khi danh muc doi
- Tiep tuc uu tien kiem thu thuc te cac thao tac ghi/sua/xoa de xac nhan Supabase cache tuoi dung sau ghi.

### 3. Gan realtime nhung van giu Google Sheet la source of truth

- Sua tay tren Google Sheet: trigger tick 1 phut dong bo luan phien cache gan nhat, co lock de tranh chay chong.
- Them trigger gan truc tiep file Van tai bang `installTransportSheetSyncTrigger()` de bat edit/change thu cong tren cac sheet `NL_*`; day la huong Sheet -> Supabase nhanh hon trigger tick luan phien.
- Ghi tu web app: ghi Google Sheet truoc, sau do sync nhanh cache lien quan de UI co du lieu som.
- Da them panel quan sat `Cai dat > Trang thai dong bo` de nhin duoc cache nao moi/cũ/lỗi truoc khi mo rong realtime notification.
- Luu y: xoa/sua thu cong truc tiep trong Google Sheet van phu thuoc installable trigger cua Apps Script nen khong phai realtime tuyet doi nhu database subscription; muc tieu hien tai la do tre thap hon tick luan phien va co trang thai quan sat trong `sync_status`.
- Chua chuyen source-of-truth sang Supabase neu chua co quyet dinh rieng.

### 3b. Toi uu ghi tu web app bang write queue v2

- Muc tieu: khi bam Luu, frontend nhan phan hoi nhanh sau khi tao job trong Supabase; khong cho frontend cho Apps Script ghi Google Sheet xong.
- Job co trang thai ro: `pending`, `processing`, `synced`, `failed`; co `write_job_logs` va retry.
- Worker Apps Script xu ly job theo module, ghi Google Sheet bang cac service hien co, sau do sync cache Supabase lien quan.
- Source code hien dung `ASYNC_TRANSPORT_WRITE_ENABLED=true` cho `transport/submitRows`, `transport/saveSheetRow`; `deleteSheetRow` chi vao queue khi co danh sach cot can clear, khong queue physical `deleteRow()`. Van giu `ASYNC_WRITE_ENABLED=false` de tranh bat lai v1 dai tra.
- Pilot `fund/addFundTransactions` doc flag tu Script Property, mac dinh false trong code va da bat true tren production sau khi migration/auth/worker kiem tra thanh cong.
- Yeu cau v2 khac v1: frontend hien job pending trong danh sach local va bang Van hanh ngay sau khi Luu, khoi phuc job gan day sau reload, worker khong lam cham request, va cache/danh sach that reload khi job `synced`.

### 4. Thong bao va mo rong phan quyen

- Sau khi Bao cao va cache on dinh, thiet ke `notification_events` cho thong bao in-app tu `XL_DoiSoatChuyen`.
- Auth/role toi thieu da co `admin`, `operator`, `shareholder`; chi mo rong permission chi tiet khi co nhu cau nghiep vu moi va phai giu proxy la diem enforcement.

## Cach tiep tuc o cuoc tro chuyen moi

Prompt chuẩn được quản lý tại `TARGET_ARCHITECTURE.md`, mục **Prompt chuẩn cho cuộc trò chuyện mới**.

Agent mới phải đọc `AGENTS.md`, `docs/ai/AI_START_HERE.md`, `PROJECT_CONTEXT.md`, `TARGET_ARCHITECTURE.md`, `PROJECT_SCHEMA.md` và `REFACTOR_PLAN.md`; sau đó chỉ báo cáo trạng thái và chờ phê duyệt. Không được tự bắt đầu Step 34 hoặc bất kỳ thay đổi mới nào.
