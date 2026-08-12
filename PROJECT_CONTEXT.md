# PROJECT_CONTEXT

## 1. Cách dùng handoff này

Đây là nguồn handoff sống duy nhất của dự án. Mỗi cuộc trò chuyện mới chỉ bắt buộc:

1. đọc toàn bộ `AGENTS.md`;
2. đọc toàn bộ file này;
3. kiểm tra `git status --short`.

Sau đó Agent phải có thể báo đúng sáu nội dung: dự án/module, kiến trúc production, checkpoint gần nhất, checkpoint tiếp theo, kiến trúc đích và risk/gate.

Các tài liệu khác chỉ đọc theo router ở mục 9. Tài liệu lịch sử không được dùng để suy ra current state.

## 2. Dự án và module nghiệp vụ

Vận tải Đông Bắc là web app nội bộ cho khoảng 4–5 người dùng, ưu tiên tra cứu nhanh, báo cáo đúng Google Sheet, nhập liệu an toàn, phân quyền rõ và rollback được theo checkpoint.

Đây là Apps Script Web App độc lập, không gắn cố định với một Google Sheet. Workbook được resolve theo request/năm/Script Properties; backend chính dùng `SpreadsheetApp.openById(id)`.

Hai domain độc lập:

1. **Vận tải**
   - workbook riêng theo năm;
   - Tổng quan, Báo cáo, Vận hành/Nhập liệu và Danh mục.
2. **Thu chi/Quỹ**
   - workbook riêng theo năm;
   - Tổng quan quỹ, Giao dịch, Công nợ, Khoản vay, Danh mục và thiết lập đầu kỳ;
   - web app không triển khai in phiếu Thu/Chi theo quyết định của người dùng ngày 2026-08-10;
   - là module/menu riêng, không chỉ là nguồn import cho Vận tải.

Một số liên kết giữa hai workbook do công thức/`IMPORTRANGE` thực hiện. Không gộp workbook, đổi tên sheet, đổi thứ tự cột hoặc sửa công thức nếu chưa có migration riêng được phê duyệt.

## 3. Kiến trúc production hiện tại

```text
Browser / Next.js App Router
        ↓
Vercel same-origin API (`/api/app`, `/api/push`, `/api/fund-alerts`)
  - Supabase HttpOnly session
  - allowlist/RBAC/origin guard
  - read cache, account và Web Push boundary
        ↓
Apps Script standalone API-only
  - application/domain services
  - authoritative Sheet writes
  - worker/trigger/cache sync/audit
        ↓
Google Sheets source of truth + Supabase read model/cache/queue/Auth
```

Vai trò:

- Google Sheets là source of truth và nguồn đối soát cuối cùng.
- Supabase cung cấp Auth, read model/cache, write queue, sync status và notification state.
- Apps Script là API/integration backend, nơi validate/ghi có thẩm quyền và đồng bộ cache.
- Vercel/Next.js là presentation và public API boundary; service-role secret không đi xuống browser.

Runtime chính:

- Next.js `16.2.11`, React `19.2.7`.
- Source route/component nằm trong `next-shell/`; root `app/` là entrypoint mỏng.
- `/` chạy Next.js App Router; Apps Script không còn render HTML.
- Auth dùng Supabase session trong cookie `HttpOnly`, `SameSite=Strict`, có refresh/keepalive.
- Workbook/year context được resolve phía server; năm dữ liệu thật hiện hành là 2026, bắt đầu từ 05/2026.
- Report runtime là Supabase-only cache; khi cache miss/lỗi, Apps Script live-compute từ Google Sheets trong execution rồi upsert lại Supabase.

Production đã xác nhận gần nhất:

- URL: `https://dongbac.vercel.app`.
- Vercel deployment: `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde`.
- Apps Script production cùng deployment ID: code version `@322`; rollback gần nhất `@315`.
- Vercel rollback gần nhất: `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`.
- Supabase project canonical: `lyquwesyjbpalnwfxzwl`.
- Vercel project canonical: `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`.

Preview hiện hành của checkpoint đồng bộ dropdown theo ngữ nghĩa workbook:

- URL duy nhất: `https://vantaidongbac-preview.vercel.app`.
- Vercel deployment: `dpl_5KTTgbsnJr68Kh7QygJGybeKmwvN`, READY ngày 2026-08-12.
- Apps Script Preview: `@325`, deployment ID riêng với Production.
- Chỉ deploy bằng `npm run deploy:preview`.
- Gate deploy PASS 480/480 tests, lint, typecheck, Next build, Identity Guard, root/title/API smoke. Candidate này chưa được promote; Production vẫn là `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde` và Apps Script Production vẫn `@322`.
- Vercel Git Integration đã disconnect khỏi GitHub ngày 2026-08-10; push/merge không tự tạo Preview hoặc Production deployment. Mọi Preview chỉ đi qua script chuẩn.

## 4. Quá trình dự án đã hoàn thành

Timeline này thay cho nhật ký checkpoint dài trước đây. Chi tiết sâu được giữ trong Git, `CHANGELOG.md`, `REFACTOR_PLAN.md`, `AUDIT_REPORT.md` và contract liên quan.

### 4.1. Audit và refactor nền tảng — 2026-07-11 đến 2026-07-12

- Hoàn thành technical audit và chương trình refactor Step 1–36.
- Tách service/repository/domain boundary, tăng characterization tests và giữ nguyên nghiệp vụ.
- `AUDIT_REPORT.md` và `REFACTOR_PLAN.md` hiện là tài liệu lịch sử.

### 4.2. Next.js migration A1–D1 — 2026-07-12 đến 2026-07-19

- Dựng Next.js runtime, cookie auth, workbook context và shared shell.
- Chuyển lần lượt Report, Dashboard, Manage, Entry, Catalog, Cashflow, Settings/Observability.
- Golden-master parity C3 được người dùng duyệt theo từng surface; các regression Report/nav/mobile drawer được sửa và retest.
- D1 loại bỏ presentation legacy khỏi source; rollback presentation được giữ bằng deployment Vercel bất biến.
- Auth session continuity đã promote production và authenticated smoke PASS.
- `NEXTJS_MIGRATION_PLAN.md` là roadmap lịch sử đã hoàn thành, không còn là backlog sống.

### 4.3. Report cache E1.1–E1.6 — 2026-07-18 đến 2026-07-19

- Tạo schema foundation, chạy dual parity và cutover `REPORT_CACHE_MODE=supabase`.
- Compact `SYS_ReportCache` từ 198.900 xuống 40 hàng rollback sau backup/fingerprint/approval.
- Cài freshness queue cho edit trực tiếp workbook Vận tải, có debounce/retry/structural full refresh.
- Supabase giữ report bundles; Google Sheets vẫn là nguồn tính toán chuẩn.

### 4.4. UI/UX, Supabase-first và schema drift — 2026-07-21 đến 2026-07-31

- Hoàn thành design system, shell/navigation và nâng cấp toàn bộ module.
- Sửa sticky table, export PNG, mobile bottom sheet/swipe, input zoom, numeric formatting và navigation performance.
- Audit schema drift workbook thật tại checkpoint tháng 7 từng ghi nhận `NL_TaiXe` có `Dự án`; kết luận này là lịch sử và đã được live audit 2026-08-10 thay thế bằng schema 7 cột có `Nhóm vận hành`. Write path vẫn chỉ tác động native business range và bảo toàn helper/formula.
- Đọc Dashboard/Report/Manage/Catalog/Cashflow chuyển Supabase-first/fail-closed; Apps Script chỉ live-read khi force refresh hoặc fallback có chủ đích.
- Thu chi có shared date range, pagination, optimistic writes và form khoản vay nhiều dòng.
- Sửa toàn vẹn `NHAP_VAY`: chỉ ghi A:K, bảo vệ `ARRAYFORMULA` N2 và dùng mã khoản vay 12 chữ số có lock/sequence.

### 4.5. Web Push, notification và environment guard — 2026-07-30 đến 2026-08-05

- Thêm push-only service worker, không có offline data cache.
- Migration `011–013` thêm subscription, rule state, preferences/config/audit server-only.
- iPhone Add to Home Screen và self-test đã được người dùng xác nhận.
- Rule cảnh báo số dư Quỹ dưới 10 triệu đã dry-run PASS; production cron/feature flag chưa bật.
- Environment Identity Guard khóa đúng app/Supabase/Vercel/Apps Script identities.
- Canary hai chiều Webapp → queue → Sheet → Supabase và Sheet → Supabase → Webapp PASS; filtered-row write có fallback từng ô bảo toàn công thức, delete Vận hành là clear-only.

### 4.6. Dashboard/Report production polish — 2026-08-05

- Dashboard/Report polish, unique physical vehicle count, date-serial recovery và quản lý xóa tài khoản đã promote production.
- Gate 462/462 tests, lint, typecheck, build, Identity Guard và smoke production PASS.
- Tài khoản `test` chưa bị xóa; đây là thao tác quản trị riêng.

## 5. Checkpoint gần nhất và trạng thái hiện tại

### Live dropdown semantics — Preview hoàn thành 2026-08-12

- Đã audit read-only hai workbook canonical theo từng sheet/cột và đối chiếu validation vật lý, helper list, header cùng dữ liệu thực. Dropdown được ánh xạ theo ngữ nghĩa trường thay vì suy luận chung từ chữ `Dự án`.
- `NL_TaiXe.Nhóm vận hành` nay là trường chọn bắt buộc và lấy đúng `SYS_DanhSach!DS_NhomVanHanh`: `Tràng Duệ`, `Amata`, `Dự án nhỏ`; không còn tự suy ra từ phân công xe hoặc hiển thị dự án đơn lẻ. `NL_NghiVanHanh.Dự án` cũng dùng nhóm vận hành theo dữ liệu live, còn `NL_VanChuyen.Dự án` tiếp tục dùng danh sách dự án đơn lẻ.
- Catalog editor dùng mapping sheet-aware cho các tham chiếu dự án, nhóm vận hành, xe, nhân sự và cờ Có/Không; các trường định danh chính của từng danh mục không bị biến thành dropdown tự tham chiếu.
- Module Quỹ đã đồng bộ `HINHTHUC`, mở rộng đúng phạm vi `MUCTHU`/`MUCCHI`, yêu cầu hình thức cho thu/chi/vay/trả và giữ đúng loại thanh toán `Vay`, `Trả nợ`, `Trả lãi` (không phát sinh `Trả gốc`).
- Đã chạy thành công ba tác vụ cache `syncAllStartupAndCatalogsToSupabase`, `syncAllFundBundlesToSupabase`, `syncAllFundCatalogsToSupabase`. Apps Script Preview `@325` health HTTP 200; OAuth được cấp lại để khôi phục health của cả hai deployment nhưng không thay đổi code/deployment Production.
- Full deploy gate PASS 480/480 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_5KTTgbsnJr68Kh7QygJGybeKmwvN`; Production giữ nguyên Vercel `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde` và Apps Script `@322`.
- Authenticated visual QA của candidate mới còn chờ máy Mac được mở khóa; source contract, unit/HTTP smoke và cache sync đã PASS, nhưng chưa coi visual interaction này là bằng chứng đã hoàn tất.

### Dashboard Phí Phường và toolbar hai cột — Preview hoàn thành 2026-08-11

- Đã đọc live `BC_TongQuan!G3:S15` từ workbook Vận tải canonical. Header tháng có thêm `Phí Phường`; tháng 07/2026 có `Phí Đi Đường = 64.000.000` và `Phí Phường = 16.500.000`, còn tháng 08/2026 cả hai bằng 0. Không ghi hay thay đổi Google Sheet.
- Parser dashboard resolve `Phí Phường` theo header thay vì vị trí cố định, đưa khoản này vào fallback lợi nhuận gộp và tổng hợp `Tất cả tháng`. Biểu đồ đổi nhãn thành `Phường & Luật` và cộng `Phí Đi Đường + Phí Phường`; authenticated Preview QA tháng 07/2026 hiển thị đúng `80.500.000`.
- Toolbar Quỹ và Vận hành dùng một contract hai cột ở mọi breakpoint: khoảng ngày bên trái bằng đúng chiều rộng ô tìm kiếm; kỳ nhanh bên phải bằng đúng chiều rộng nút `Nhập mới`. Native select indicator được loại bỏ và text filter căn trái.
- Authenticated Preview QA PASS tại 390x844 và 1440x900 cho Vận hành/Vận chuyển và Quỹ/Danh sách thu chi: mobile lần lượt 222/118 px, desktop 960/118 px; hai cặp cột khớp tuyệt đối, không tràn ngang, không console error.
- Full deploy gate PASS 478/478 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_9ScEMdJKuHE8hQKqj5tf1c2cWxc3`; Apps Script Preview vẫn `@322`; Production giữ nguyên `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde`.

### Live Google Sheet parity — Production hoàn thành 2026-08-10

- Checkpoint được phát triển trên `codex/live-sheet-parity`, sau đó fast-forward vào `main` canonical tại commit `d5707ae` trước production cut-forward.
- Đã đối chiếu live workbook Vận tải 37 sheet và workbook Thu Chi 9 sheet.
- Write contract Vận tải đã khóa theo exact live headers; `NL_VanChuyen` 8 cột, `NL_TaiXe` dùng `Nhóm vận hành`, `NL_Dau` 10 cột và `NL_NghiVanHanh` 10 cột. Cơ chế cũ tự suy ra nhóm từ phân công xe đã được checkpoint 2026-08-12 thay bằng lựa chọn explicit từ `SYS_DanhSach!DS_NhomVanHanh`.
- Đã thêm các danh mục live `DM_CheDoLuong`, `DM_GiaDau`, `DM_PhanCongXe`, `DM_UuDaiNoiBo`; loại virtual catalog cũ `DM_ThamSo_GD`; UI/backend chỉ cho sửa cột nhập, giữ cột công thức. Live canary xác nhận `DM_GiaDau!C` dù mang header `Ghi chú` là công thức chênh lệch nên webapp khóa cột này và helper append sao chép công thức bị skip từ dòng trước.
- Thay đổi danh mục từ web app hoặc trực tiếp trong Sheet làm mới catalog cache và full report dependency; source poll `NL_VanChuyen` đã đọc đủ 8 cột.
- Thu Chi có tab `Công nợ` đọc `Công nợ còn lại` tại cột M và admin/operator có thể sửa đúng 4 named range `TMDK`, `TKDK`, `NGAYNHAPLIEU`, `NGAYTINHVAY` trong `CAIDAT`.
- Không triển khai `INPHIEU`/in phiếu theo yêu cầu rõ của người dùng.
- Full gate cuối PASS sau regression fix `DM_GiaDau`: 473/473 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`.
- Copy-canary PASS trên bản sao riêng của cả workbook Vận tải và Thu Chi: các form/danh mục mới giữ công thức, validation, format và computed values; Công nợ M/N và bốn ô thiết lập đầu kỳ ghi/đọc đúng. Marker/dữ liệu test đã được xóa, bốn thiết lập đã khôi phục, rồi hai bản sao TEST đã được xóa vĩnh viễn. Hai workbook Production không bị ghi.
- Apps Script Preview và Production hiện cùng code version `@322` trên hai deployment ID tách biệt; health Production trực tiếp HTTP 200. `@315` được giữ làm rollback.
- Vercel Preview hiện hành đã deploy bằng đúng `npm run deploy:preview`: `dpl_GCcDLkxAT9JiwKnLUtNsx243z494` tại `https://vantaidongbac-preview.vercel.app`; title/health HTTP smoke PASS, không Vercel Login.
- Đã chạy thành công `syncAllStartupAndCatalogsToSupabase`, `syncAllFundBundlesToSupabase` và `syncAllFundCatalogsToSupabase`; authenticated Preview smoke PASS cho Entry, 12 catalog, `DM_GiaDau` chỉ nhập A:B, Công nợ và đúng 4 thiết lập đầu kỳ. Không có `INPHIEU`/in phiếu và không có console error.
- Vercel Production đã promote bằng candidate đóng gói riêng với Production environment và Apps Script Production: `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde`. Deployment cũ `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6` vẫn READY để rollback.

### UI/UX density polish — Preview hoàn thành 2026-08-10

- Đã loại chú thích triển khai/named range và các dòng đếm kết quả lặp khỏi bề mặt nghiệp vụ Quỹ; nhãn lọc Khoản vay được giữ ẩn cho trình đọc màn hình qua `aria-label`.
- Bộ lọc thời gian dùng chung của Quỹ và Vận hành hiển thị ba trường trên một hàng từ 769px; mobile giữ hai ngày trên cùng một hàng. Bộ lọc lịch sử vay/trả trên mobile hiển thị hai select cạnh nhau.
- Tiêu đề bảng Khoản vay đã chuẩn hóa về cùng cỡ 15px và chiều cao header 51px; card lịch sử mobile giảm từ 174px xuống 82px.
- Các `select` lọc theo danh sách cố định đã dùng chiều rộng nội tại theo lựa chọn dài nhất; ô tìm kiếm và khoảng ngày vẫn co giãn để dùng phần không gian còn lại. Visual QA Preview xác nhận tại 1440px và 390px: bộ lọc đối tác chứa đủ `Quang Quân`, hai bộ lọc lịch sử vay/trả cùng hàng và không tràn viewport.
- Visual QA có đăng nhập PASS ở 390px, 960px và 1440px cho Tổng quan, Báo cáo, Vận hành, Danh mục, Quỹ/Khoản vay và Cài đặt; mọi route được kiểm tra đều có `scrollWidth === clientWidth` ở cấp trang.
- Gate Preview PASS 475/475 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`; Production giữ nguyên `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`.

### UI correction và helper-column hardening — Preview hoàn thành 2026-08-10

- Bộ lọc thời gian Quỹ mobile dùng một grid hàng ngang cho quick period và hai ngày; select co theo giá trị đang chọn bằng `field-sizing: content`, nhãn all-year rút gọn thành `Năm 2026`.
- Date filter Quỹ desktop hiển thị native date input thật, đã sửa specificity xung đột với C2 golden CSS; authenticated Preview QA xác nhận control `opacity: 1`, `position: static`, click/focus được và ba trường cùng hàng.
- Mọi nút đóng/hủy và đường lưu thành công của drawer Quỹ, Catalog, Vận hành đi qua swipe-dismiss exit contract 190 ms thay vì unmount ngay.
- Live `DM_NhanSu!K` mang header `Cột 11` là formula helper spill danh sách tài xế đang làm, không phải business field. Apps Script `@322` và Next catalog boundary đều dùng allowlist business fields để loại helper dù cache cũ hoặc workbook đổi tên helper; authenticated Preview QA xác nhận header còn `Trạng Thái`, `Công ty` và không còn `Cột 11`.
- Full deploy gate PASS 476/476 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_AWq2jcQXoCS4D3L8TzuCuruTHnSj`; Apps Script Preview `@322`; Production không đổi.

### Shared filter-toolbar contract — Preview hoàn thành 2026-08-10

- Chuẩn hóa một contract duy nhất cho toolbar lọc của Quỹ và Vận hành trên mobile lẫn desktop: hàng 1 luôn là kỳ nhanh + từ ngày + đến ngày; hàng 2 luôn là tìm kiếm + hành động chính. Nút `Nhập mới` không còn bị kéo toàn chiều rộng hoặc chen giữa bộ lọc thời gian.
- CSS dùng cùng grid/flex contract và cùng thứ tự thông tin ở mọi breakpoint; select kỳ co theo nội dung, ngày và tìm kiếm nhận phần chiều rộng còn lại, nút hành động giữ kích thước theo nhãn.
- Authenticated Preview QA PASS ở desktop và mobile 390px cho cả Quỹ/Danh sách thu chi và Vận hành/Vận chuyển: hai nhóm điều khiển nằm đúng hàng, date input desktop thao tác được và `scrollWidth === clientWidth`.
- Full deploy gate PASS 477/477 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_GCcDLkxAT9JiwKnLUtNsx243z494`; Apps Script Preview vẫn `@322`; Production giữ nguyên `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`.

### Production cut-forward live parity/UI contract — hoàn thành 2026-08-10

- Người dùng phê duyệt Production trong yêu cầu riêng. Full gate trước cut-forward PASS 477/477 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`; `main` đã fast-forward/push tại `d5707ae`.
- Không promote trực tiếp Vercel Preview vì candidate đó đóng gói Apps Script Preview. Apps Script Production deployment canonical được cập nhật từ `@315` lên `@322`, health trực tiếp PASS; sau đó Vercel được build lại với Production environment thành `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde` rồi mới gán alias `dongbac.vercel.app`.
- Post-cutover public smoke PASS HTTP 200 cho root, Dashboard, Report, Vận hành, Danh mục, Quỹ, Cài đặt, manifest và service worker; session không cookie trả đúng 401; API health xác nhận đúng app/Supabase/Vercel Production/Apps Script Production. Không có HTTP 500 trong log sau cutover; có một `DEP0169 url.parse()` deprecation warning trên request health 200.
- Trình duyệt kiểm thử không có phiên đăng nhập Production và không có browser khác đã đăng nhập, nên authenticated Production smoke chưa chạy trong cửa sổ cutover. Authenticated Preview QA trước cut-forward đã PASS; cần người dùng đăng nhập Production và xác nhận nhanh các module chính.
- Rollback giữ nguyên và READY: Vercel `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`, Apps Script `@315` trên cùng deployment ID Production.

### Repository consolidation và Vercel deployment guard — hoàn thành 2026-08-10

- Runtime, test và tài liệu tích lũy đã được hợp nhất qua PR `#1`; `main` tại merge commit `1d3579a` là nhánh canonical.
- Local và remote chỉ còn `main`; 17 remote checkpoint branches và 19 local branches cũ đã được dọn sau khi merge.
- Hai đầu divergent và ba backup branch cần bảo tồn được lưu bằng năm annotated tag `archive/*-20260810` hoặc `archive/pre-rollback-*` trên remote.
- Hai automatic Preview trước đó thất bại vì Vercel checkout không có `.clasp.json` Git-ignored. Identity Guard nay bắt buộc file này ở local, còn Vercel dùng canonical manifest và runtime environment checks fail-closed.
- Regression fix `36a8176` đã PASS full gate 467/467 tests, lint, typecheck, Next build và `git diff --check`; Git-triggered verification deployment sau fix đã READY.
- Vercel Git Integration đã disconnect; Preview chỉ deploy bằng `npm run deploy:preview`. Production deployment vẫn giữ nguyên `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`.

### Retirement `SYS_ReportCache` — hoàn thành 2026-08-08

Trạng thái: **RETIRED trên workbook; Preview và Production runtime PASS**.

- Runtime candidate chuẩn hóa mọi cấu hình cache cũ về Supabase-only.
- `SheetService` không còn đọc/ghi `SheetReportCacheRepository`; repository không thể tự tạo tab.
- Migration `ReportCacheRetirementMigration.gs` có dry-run, exact-version gate, backup, fingerprint, prepare, one-shot approval, guarded delete và restore có approval.
- Full gate PASS 467/467 tests, lint, typecheck, Next build, Identity Guard và `git diff --check` tại thời điểm checkpoint.
- Authenticated Preview audit 4/4 tháng và live-compute path PASS.
- Tab `SYS_ReportCache` đã được guarded delete lúc `2026-08-08T14:30:36.078Z`.
- Hậu kiểm trả `alreadyRetired=true`, runtime `supabase`, đủ 5 bundle `05/2026`–`08/2026` và `Tất cả` cùng `dataVersion=1786191065678`.
- Backup đã xác minh: file ID `1RDtqxA6HIl3wR9twjYPI6mchBe71whybhD0Lc4Ws960`, fingerprint `AJieHfnEU31ILBmD8EGyNp-vGDu06ANKkW_kgGJVDH4`.
- Không khôi phục tab trừ khi cần điều tra và có phê duyệt restore riêng.

## 6. Checkpoint tiếp theo đề xuất

1. **Authenticated Preview dropdown confirmation**: sau khi máy Mac được mở khóa, xác nhận trực tiếp `NL_TaiXe` chỉ có ba nhóm vận hành, `NL_NghiVanHanh` dùng nhóm và `NL_VanChuyen` vẫn dùng dự án đơn lẻ; chỉ đọc/mở/đóng form, không ghi dữ liệu nghiệp vụ.
2. **Authenticated Production confirmation**: người dùng đăng nhập `https://dongbac.vercel.app` và kiểm tra nhanh Quỹ, Vận hành, Danh mục; không cần chạy write canary mới nếu chỉ xác nhận UI/read path.
3. **Production stabilization**: theo dõi lỗi 5xx và regression phiên đăng nhập sau cut-forward; rollback ngay về Vercel `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6` + Apps Script `@315` nếu phát hiện lỗi nghiệp vụ nghiêm trọng.
4. **Cron cảnh báo Quỹ riêng**: vẫn là checkpoint độc lập, chưa bật.

## 7. Mục tiêu kiến trúc dài hạn

Definition of Done hiện giữ:

1. Next.js App Router là presentation duy nhất.
2. Server Components xử lý layout/auth/initial read khi phù hợp; Client Components chỉ giữ interaction/browser state.
3. Mọi module đi qua API contract thống nhất, không DOM bridge/global legacy.
4. Auth/RBAC được enforce ở Vercel và Apps Script boundary phù hợp.
5. Workbook/year context rõ cho mọi request.
6. Apps Script chỉ là API/integration/worker/sync.
7. Google Sheets tiếp tục là source of truth cho tới khi có migration kiến trúc riêng.
8. Supabase tiếp tục là Auth/read model/cache/queue, không âm thầm thành source of truth.
9. Build, lint, typecheck, tests, identity, RBAC và responsive QA là quality gates bắt buộc.
10. Mọi thay đổi production có candidate bất biến và rollback rõ.

## 8. Rủi ro và gate bắt buộc

1. `main` là nhánh canonical duy nhất; không khôi phục branch cũ từ archive tag nếu chưa xác định rõ commit cần lấy. Không reset/xóa thay đổi chưa rõ nguồn.
2. Authenticated Preview đã PASS; deployment Production mới chưa có authenticated smoke vì browser kiểm thử không giữ phiên đăng nhập. Operator/shareholder vẫn chưa có representative production smoke đầy đủ.
3. Authenticated visual/device QA không thể được thay thế hoàn toàn bằng unit/HTTP/DOM test.
4. Apps Script public deployment từng trả 403 dù UI permission đúng; health trực tiếp và identity fingerprint phải được kiểm tra sau deploy.
5. Identity Guard chỉ yêu cầu `.clasp.json` trong local workspace; Vercel build không có file Git-ignored này và phải dựa vào canonical manifest + runtime environment checks.
6. Client từng cài service worker legacy cần theo dõi riêng; service worker hiện tại không cache app/data.
7. iOS Web Push chỉ hoạt động với app Add to Home Screen và quyền được cấp từ thao tác người dùng.
8. Mọi thay đổi Google Sheet/Supabase schema phải có migration riêng; migration `001–013` đã chạy là bất biến, correction tiếp theo dùng `014+`.
9. Không đổi tên sheet, thứ tự cột, công thức hoặc helper range. Xóa Vận hành là clear-only.
10. Report parity phải dùng exact `source_data_version`, loại field volatile khỏi hash và kiểm tra đủ các tháng hiện hành cùng `Tất cả`.
11. Manual edit workbook Thu chi hoặc thay đổi chỉ lan qua `IMPORTRANGE` không được bảo đảm cùng SLA freshness với workbook Vận tải.
12. Rollback Apps Script dùng version còn lưu trên cùng production deployment ID; không dùng recovery deployment `@281` đã undeploy.
13. Production warning `DEP0169 url.parse()` có thể xuất hiện trên request HTTP 200; chưa có call site trực tiếp trong source.
14. Live parity đã PASS copy-canary, full gate, authenticated Preview và public Production smoke; authenticated Production confirmation còn chờ người dùng đăng nhập. Không dùng `INPHIEU` làm tiêu chí parity vì người dùng đã loại chức năng này.

## 9. Router tài liệu

| Tác vụ | Đọc thêm |
| --- | --- |
| Quy tắc/routing | `docs/ai/AI_START_HERE.md`, `docs/governance/DOCUMENTATION_POLICY.md` |
| Kiến trúc hiện tại | `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/MODULE_MAP.md`, `docs/architecture/DATA_FLOWS.md` |
| API/Auth/RBAC | `docs/contracts/API_CONTRACTS.md`, `docs/contracts/RBAC_MATRIX.md` |
| Google Sheet/schema/formula | `PROJECT_SCHEMA.md`, `docs/contracts/SPREADSHEET_CONTRACTS.md` |
| Supabase/cache/queue | `SUPABASE_SCHEMA.md`, migrations, `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md` |
| Thu chi bound script | `docs/legacy/THU_CHI_BOUND_SCRIPT.md` và source snapshot |
| Test/risk | `docs/quality/TEST_STRATEGY.md`, `docs/quality/KNOWN_RISKS.md` |
| Deploy/rollback | `WORKFLOW.md`, `ROLLBACK.md`, `SUPABASE_SETUP.md` |
| Kiến trúc đích | `TARGET_ARCHITECTURE.md` |
| Lịch sử | `CHANGELOG.md`, `NEXTJS_MIGRATION_PLAN.md`, `REFACTOR_PLAN.md`, `AUDIT_REPORT.md`, Git history |

## 10. Trạng thái tài liệu

- Loại: `CURRENT` living handoff.
- Owner: current state, timeline rút gọn, checkpoint gần nhất, checkpoint tiếp theo và gates.
- Không sở hữu: contract/schema/runbook chi tiết.
- Nguồn kiểm chứng: source, tests, migrations, deployment checkpoint và Git.
- Ngày hệ thống lại: 2026-08-11.
- Cập nhật khi: production/preview/checkpoint/architecture/source-of-truth/blocker thay đổi.
