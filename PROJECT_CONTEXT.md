# PROJECT_CONTEXT

File nay la handoff/living roadmap chinh cua du an. Khi bat dau mot cuoc tro chuyen moi, hay doc file nay truoc, sau do doc them `AGENTS.md`, `PROJECT_SCHEMA.md`, `SUPABASE_SCHEMA.md`, `WORKFLOW.md`, va `ROLLBACK.md` neu tac vu co lien quan.

## Muc tieu san pham

- Web app noi bo cho Van tai Dong Bac, deploy frontend tren Vercel.
- Apps Script la backend/API va van duoc dong bo bang clasp.
- Google Sheet Van tai va Google Sheet Thu chi van la nguon du lieu chuan.
- Supabase dung lam database/cache doc nhanh, khong thay the Google Sheet o giai doan hien tai.
- Nguoi dung noi bo khoang 4-5 nguoi, uu tien tra cuu nhanh, bao cao dung, nhap lieu an toan.

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
- Apps Script deployment moi nhat da xac nhan: `@216 - Fix dashboard operating cost KPI endpoint`
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
- `syncRealtimeCache()` van giu vai tro backfill/trigger dinh ky, khong con la co che chinh de lam tuoi cache sau ghi tu web app.
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

- Giam `syncRealtimeCache()` toan cuc vi chay lau.
- Da bat dau dua duong ghi web app ve cac ham sync nho:
  - report/dashboard thang vua thay doi
  - manage month vua ghi
  - fund transaction month vua ghi
  - startup/catalog chi sync khi danh muc doi
- Tiep tuc uu tien kiem thu thuc te cac thao tac ghi/sua/xoa de xac nhan Supabase cache tuoi dung sau ghi.

### 3. Gan realtime nhung van giu Google Sheet la source of truth

- Sua tay tren Google Sheet: trigger 5 phut dong bo cache.
- Ghi tu web app: ghi Google Sheet truoc, sau do sync nhanh cache lien quan de UI co du lieu som.
- Chua chuyen source-of-truth sang Supabase neu chua co quyet dinh rieng.

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
