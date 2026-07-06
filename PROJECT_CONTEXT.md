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
- Apps Script deployment moi nhat da xac nhan: `@227 - Enable transport write queue v2`
- Apps Script deployments da don ngay 2026-07-06: chi con `@HEAD` va production `AKfycby6... @227`; cac deployment cu `@145`, `@212`, `@213` da undeploy de tranh goi nham URL.
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

## File tài liệu hiện hành

- `AGENTS.md`: quy tac lam viec bat buoc cho Codex.
- `PROJECT_CONTEXT.md`: file nay, dung de tiep tuc boi canh/lộ trình giua cac cuoc tro chuyen.
- `PROJECT_SCHEMA.md`: schema/ban do chi tiet Google Sheet, Apps Script, frontend.
- `SUPABASE_SCHEMA.md`: schema Supabase va mapping cache.
- `SUPABASE_SETUP.md`: huong dan lay key, dat bien moi truong, setup trigger.
- `WORKFLOW.md`: quy trinh hang ngay khi sua frontend, Apps Script, Supabase, deploy, rollback.
- `ROLLBACK.md`: cach rollback Supabase/cache/code.
- `README.md`: gioi thieu ngan va lenh deploy nhanh.

## Lo trinh tiep theo

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
- Ghi tu web app: ghi Google Sheet truoc, sau do sync nhanh cache lien quan de UI co du lieu som.
- Da them panel quan sat `Cai dat > Trang thai dong bo` de nhin duoc cache nao moi/cũ/lỗi truoc khi mo rong realtime notification.
- Chua chuyen source-of-truth sang Supabase neu chua co quyet dinh rieng.

### 3b. Toi uu ghi tu web app bang write queue v2

- Muc tieu: khi bam Luu, frontend nhan phan hoi nhanh sau khi tao job trong Supabase; khong cho frontend cho Apps Script ghi Google Sheet xong.
- Job co trang thai ro: `pending`, `processing`, `synced`, `failed`; co `write_job_logs` va retry.
- Worker Apps Script xu ly job theo module, ghi Google Sheet bang cac service hien co, sau do sync cache Supabase lien quan.
- Hien da bat feature flag rieng `ASYNC_TRANSPORT_SUBMIT_ENABLED=true` cho `transport/submitRows`; van giu `ASYNC_WRITE_ENABLED=false` de tranh bat lai v1 dai tra.
- Yeu cau v2 khac v1: frontend hien job pending trong danh sach local ngay sau khi Luu, worker khong lam cham request, va cache/danh sach chi reload khi job `synced`.

### 4. Thong bao va phan quyen

- Sau khi Bao cao va cache on dinh, thiet ke `notification_events` cho thong bao in-app tu `XL_DoiSoatChuyen`.
- Sau thong bao, thiet ke user/role toi thieu cho noi bo.
- Khong dua auth/role vao neu chua co luong du lieu chuan va rollback ro.

## Cach tiep tuc o cuoc tro chuyen moi

Nguoi dung chi can noi: "Doc `PROJECT_CONTEXT.md` va tiep tuc lo trinh." Codex moi phai:

1. Doc `AGENTS.md`.
2. Doc `PROJECT_CONTEXT.md`.
3. Neu sua schema/cache, doc `SUPABASE_SCHEMA.md`.
4. Neu deploy/rollback, doc `WORKFLOW.md` va `ROLLBACK.md`.
5. Kiem tra `git status --short` truoc khi sua.
6. Giai thich ke hoach ngan bang tieng Viet truoc khi edit.
