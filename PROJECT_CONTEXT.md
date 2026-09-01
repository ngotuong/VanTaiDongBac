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
- Vercel deployment: `dpl_EWqPcWWjNpk2eJdMYi7tYqRWjohv`, READY và cut-forward ngày 2026-09-01.
- Apps Script production cùng deployment ID canonical: code version `@350`; rollback gần nhất `@349`, tiếp theo `@348`, `@344`, `@343`, `@340`.
- Vercel rollback gần nhất: `dpl_3Fe4NCtEtZAzEe4547JpM9z5UPG7`; rollback lịch sử tiếp theo là `dpl_4H1DouQ7TDgj86fUBvDbP3axgvqH`, `dpl_7rphNyrL2aUVGU5FKFZbVARDS2GU`, `dpl_By46eeK9wbaq4YCMqdEZZLPbXxM1`, `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR`, `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`, `dpl_C7ovMrnmLjveFr6soZQijTtLcmba`, `dpl_9TNAVm9ifWXWxKx5Knzw57j8Vkio`, `dpl_85PsF73o52beq8SuKrK8915nzu4f`, `dpl_4LQnv87HMgV96P5rVvc2m83WDhK2`, rồi `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q`.
- Supabase project canonical: `lyquwesyjbpalnwfxzwl`.
- Vercel project canonical: `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`.

Preview hiện hành:

- URL duy nhất: `https://vantaidongbac-preview.vercel.app`.
- Vercel deployment: `dpl_FZmt6FLbDPACwG4FAmFNc3N4Taxx`, READY ngày 2026-09-01; root/title, session guard, health và authenticated Observability QA PASS.
- Apps Script Preview: `@350`, deployment ID `AKfycbxZ79e_10-DTkPZI8dMz69v5J6iMccR52S8bqWpl7EYCUru-5T_URD4fn7NrkexOY85`; Apps Script Production web deployment cũng đã lên `@350` trên deployment ID canonical riêng.
- Chỉ deploy bằng `npm run deploy:preview`.
- Gate PASS 552/552 tests, lint, typecheck, Next build, Identity Guard và `git diff --check`.
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

### Retry và chống cảnh báo giả cho pipeline thông báo — Production 2026-09-01

- Incident lúc khoảng 17:44 là lỗi kết nối tạm thời `Address unavailable` từ Apps Script `UrlFetchApp` tới Supabase khi `dailyBusinessSummary` upsert `manage_data_bundles`; Google Sheet, schema và credential không hỏng. Pipeline tự hồi phục ở lượt kế tiếp; authenticated Production Observability xác nhận `daily_business_summary`, `trip_notifications`, `operational_notifications`, `notification_pipeline` và worker đều OK, không có queue pending.
- `SupabaseHttpClient` nay retry tối đa 3 lần với backoff 250/750 ms cho read, upsert và update idempotent khi gặp transport exception hoặc HTTP 408/429/500/502/503/504. `insertRows` và RPC không tự retry để tránh insert/claim trùng khi không chắc request trước đã được server nhận hay chưa.
- `NotificationPipelineService` tách state machine khỏi facade: lỗi đơn lẻ chỉ ghi log tên bước và retry sau một phút; chỉ sau 3 tick thất bại liên tiếp mới ghi status lỗi và dispatch cảnh báo. Khi hồi phục, status được chuyển OK trước khi dispatch để không gửi cảnh báo đã stale. Bộ đếm được xóa khi toàn bộ pipeline thành công.
- Notification Center/Push không còn đưa raw JSON, endpoint Supabase hoặc thông báo `Address unavailable` ra người dùng; lỗi thật dùng nội dung ngắn và dẫn về `Trạng thái đồng bộ`. Execution result vẫn giữ tên bước thất bại để quản trị viên khoanh vùng mà không phát tán URL kỹ thuật.
- Targeted regression PASS 30/30; full gate PASS 552/552 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview giữ Apps Script `@350`/Vercel `dpl_FZmt6FLbDPACwG4FAmFNc3N4Taxx`. Sau phê duyệt riêng, Apps Script Production canonical được cập nhật `@349` → `@350`; direct health PASS 3 lần. Vercel Production candidate `dpl_EWqPcWWjNpk2eJdMYi7tYqRWjohv` được build bằng endpoint Production, smoke trước alias rồi cut-forward `dongbac.vercel.app`. Public routes, manifest/service worker, session guard 401, health identity và log 5xx đều PASS. Authenticated Production Observability xác nhận worker cùng `daily_business_summary`, `trip_notifications`, `operational_notifications`, `notification_pipeline` đều OK; Notification Center không có lỗi đồng bộ kỹ thuật đang hoạt động. Không ghi dữ liệu nghiệp vụ, không cưỡng bức lỗi và không tạo cảnh báo/push thử. Rollback READY: Vercel `dpl_3Fe4NCtEtZAzEe4547JpM9z5UPG7`, Apps Script `@349`.

### Đồng bộ retire Hình thức và lỗi nằm trong form — Production 2026-08-30

- Root cause lỗi `Vui lòng chọn hình thức cho khoản vay.` trên Production là version skew: frontend Production đã bỏ trường `Hình thức`, nhưng Apps Script Production vẫn khóa ở `@348`, nơi `FundLoanService.buildLoanRow()` còn validation bắt buộc. Apps Script `@349` đã bỏ validation này và ghi rỗng cột vật lý legacy `NHAP_VAY!D` đúng contract.
- Ba form ghi Thu Chi (giao dịch, khoản vay, thanh toán vay) tách lỗi submit khỏi banner trang nền. Validation/API error nay hiển thị trong vùng solid `role=alert` ngay dưới header của form đang mở; form và dữ liệu nhập vẫn được giữ để sửa/gửi lại. Khi mở form mới, lỗi trang cũ được dọn để không còn cảnh báo bị che phía sau backdrop.
- Thiết kế tuân theo business-form contract và quy tắc accessibility: lỗi nằm gần ngữ cảnh thao tác, có `aria-live=assertive`, màu danger có text rõ và không phụ thuộc riêng vào màu. Không thêm lại `Hình thức` vào UI hoặc payload bắt buộc.
- Preview và Production QA authenticated xác nhận form `Thêm khoản vay` không có text `Hình thức`; bấm lưu khi thiếu dữ liệu không gọi write API, form vẫn mở, cảnh báo `Vui lòng nhập ngày vay, nơi vay và số tiền hợp lệ cho mọi khoản vay.` xuất hiện trong drawer với `role=alert`/`aria-live=assertive`, còn banner trang nền rỗng. Không ghi dữ liệu nghiệp vụ.
- Full gate PASS 545/545 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Apps Script Production canonical đã cập nhật từ `@348` lên `@349`; Vercel Production `dpl_3Fe4NCtEtZAzEe4547JpM9z5UPG7` được build riêng với endpoint Production rồi cut-forward. Public smoke PASS toàn bộ route chính, manifest, service worker, session guard 401, health đúng environment identity và không có HTTP 5xx. Rollback READY: Vercel `dpl_4H1DouQ7TDgj86fUBvDbP3axgvqH`, Apps Script `@348`.

### Mật độ bảng và bố cục khoản vay — Production 2026-08-29

- Bảng `Các khoản vay` đổi thứ tự thành `Ngày vay · Nơi vay · Số tiền · Nội dung · Trạng thái`; nhãn `Dư nợ hiện tại` được rút gọn thành `Số tiền`. Không thay đổi nguồn hoặc phép tính số dư khoản vay.
- `Nơi vay` được in đậm trong cả bảng khoản vay và lịch sử vay/trả. Các bảng danh sách của module Thu Chi dùng chung header 48px, dòng dữ liệu 52px và nền trắng/xám xen kẽ; bảng tổng quan/export dạng gọn không bị ép theo nhịp này, hàng pending và màu tiền thu/chi vẫn giữ semantic riêng.
- Header `Lịch sử vay / trả` dùng hai cột cân đối trên mobile: tiêu đề bên trái, hai bộ lọc 44px bên phải trên cùng một hàng từ 360px; màn hình hẹp hơn 360px tự xuống hàng để không tràn.
- Authenticated Preview QA tại 390×844 xác nhận hai bảng đều có dòng 52px, nền xen kẽ `rgb(255,255,255)`/`rgb(248,250,252)`, `Nơi vay` font-weight 800, tiêu đề và bộ lọc cùng hàng, trang không tràn ngang; tiền vay vẫn xanh và trả nợ vẫn đỏ. QA chỉ đọc, không submit hoặc ghi dữ liệu nghiệp vụ.
- Full gate PASS 544/544 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview đã duyệt giữ `dpl_4yJ5ye9QKSmh4Kcx9xwX6gMsMuHf`/Apps Script `@349`. Production candidate `dpl_4H1DouQ7TDgj86fUBvDbP3axgvqH` được build riêng bằng Production environment và Apps Script Production rồi alias `dongbac.vercel.app` được cut-forward theo phê duyệt; Apps Script Production giữ `@348`.
- Public Production smoke PASS cho root, Dashboard, Báo cáo, Vận hành, Danh mục, Quỹ, Cài đặt, Observability, manifest và service worker; session không cookie trả 401; health đúng app/Supabase/Vercel/Apps Script Production và không có HTTP 5xx. Authenticated Production QA tại 390×844 xác nhận header đúng, hai bảng có dòng 52px/zebra, `Nơi vay` font-weight 800, hai bộ lọc cùng hàng, không tràn ngang và màu tiền vay/trả đúng semantic. Rollback READY: `dpl_7rphNyrL2aUVGU5FKFZbVARDS2GU`; không ghi dữ liệu nghiệp vụ.

### Thu Chi Cấn trừ, retire Hình thức, khoản vay và footer mobile — Preview 2026-08-29

- Live audit workbook `ThuChiDongBac_2026` xác nhận `NHAP_THUCHI!L` là checkbox `Cấn trừ`; note/formula nghiệp vụ quy định dòng này vẫn vào chi phí và báo cáo Vận tải nhưng không làm thay đổi Quỹ. `BC_THUCHI` đang loại `L=TRUE` khỏi tính số dư. Không đổi tên sheet, thứ tự cột, validation hoặc công thức.
- Form giao dịch, khoản vay và thanh toán khoản vay đã bỏ `Hình thức`. Cột vật lý legacy `NHAP_THUCHI!E`/`NHAP_VAY!D` vẫn được bảo toàn để tương thích: dòng mới ghi rỗng; update giao dịch giữ giá trị E lịch sử.
- Form Thu Chi thêm checkbox `Cấn trừ` chỉ khi loại là `Chi`; backend reject nếu gắn vào `Thu`, ghi flag vào cột L, đọc/tìm kiếm lại flag và loại dòng này khỏi tổng/số dư Quỹ. Writer mở rộng có kiểm soát từ A:J thành A:L, vẫn chỉ quản lý công thức M:N theo contract cũ.
- Bảng `Các khoản vay` có thứ tự ổn định: đang nợ trước, rồi ngày vay mới nhất, nơi vay và mã; thêm cột `Nội dung`; cột cuối đổi thành `Trạng thái`. Form khoản vay/thanh toán không còn field/validation `Hình thức`.
- Shared business-form footer mobile có chiều cao tối thiểu 74px và đệm đáy `max(22px, 8px + safe-area-inset-bottom)`. Authenticated QA tại 390×844 đo form Thu Chi, vay và thanh toán đều `padding-bottom: 22px`, `min-height: 74px`, không tràn ngang; không có `Hình thức`, có `Cấn trừ`/`Nội dung` đúng nơi. Bảng live có header `Ngày vay · Nơi vay · Nội dung · Dư nợ hiện tại · Trạng thái`, active loan mới nhất đứng trước; console không warning/error.
- Full gate PASS 543/543 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Apps Script Preview `@349`; Vercel Preview `dpl_9PefEkcvQm865tWW7JCFUMRwUrVC` được triển khai bằng `npm run deploy:preview`; Production giữ nguyên Vercel `dpl_7rphNyrL2aUVGU5FKFZbVARDS2GU` và Apps Script web deployment `@348`.
- QA chỉ đọc/mở form, không submit và không tạo dữ liệu nghiệp vụ. Checkpoint chờ người dùng duyệt trên thiết bị thật trước khi có yêu cầu Production riêng.

### Tương thích header, màu Lãi sau lương và hủy write job an toàn — Production 2026-08-29

- Người dùng đổi `NL_VanChuyen!C2` từ `Biển số xe` thành `Biển số`. Root cause job nhập liệu bị `pending` là `AppConfig`/`EntryService` còn validate exact tên cũ; queue đã nhận write intent nhưng worker từ chối khi đối chiếu schema live.
- Contract canonical nay dùng `Biển số`. `EntryService` chấp nhận alias legacy `Biển số xe` chỉ tại đúng cột C của `NL_VanChuyen`; mọi cột khác vẫn fail-closed, không chấp nhận tên tùy ý hoặc đổi thứ tự. Cách này xử lý được Sheet hiện tại, retry job cũ và rollback workbook mà không sửa tên/cột/công thức trong Google Sheet.
- `Lãi sau lương` trong `Tổng Hợp Xe` đi chung semantic với các cột lợi nhuận: số dương xanh dương `#0284c7`, số âm đỏ `#dc2626`. Authenticated Preview QA xác nhận các giá trị dương có computed color `rgb(2, 132, 199)`.
- Job `5e8aa374-c8c4-4026-ad3a-d3537b16c877` thực tế vẫn `pending`; người dùng đã nhập dữ liệu tương ứng trực tiếp vào Google Sheet nên retry có nguy cơ ghi trùng. Job đã được hủy có lưu vết lúc 12:50 ngày 29/08, giữ row/log audit với marker `CANCELED_BY_OPERATOR`, UI hiển thị `ĐÃ HỦY`, không còn nút retry và notification center không coi đây là lỗi hệ thống.
- API `cancelWriteJob` chỉ cho admin/operator, chỉ update khi exact `id` vẫn `status=pending`, xóa claim/lock/worker và từ chối race nếu job đã `processing`/`synced`. Xác nhận hủy dùng hai bước inline `Hủy` → `Xác nhận hủy/Bỏ qua`, không dùng dialog hệ thống có thể treo trong trình duyệt nhúng.
- Đối soát trực tiếp `NL_VanChuyen!A550:H590` sau hủy xác nhận các dòng 28/08 không có bản ghi trùng hoàn toàn; hai dòng cùng xe `20H07327` thuộc hai dự án khác nhau. Không xóa/sửa dòng, tên sheet, thứ tự cột hoặc công thức Google Sheet.
- Full gate PASS 541/541 tests, ESLint, typecheck, Next production build, Environment Identity Guard và `git diff --check`. Apps Script Preview/Production khóa tại `@348`; Vercel Preview `dpl_Gku5DmR93T9xRZUoRn1A9UsKuQv5` được triển khai bằng `npm run deploy:preview`.
- Vercel Production candidate `dpl_7rphNyrL2aUVGU5FKFZbVARDS2GU` được build riêng bằng Production environment và endpoint Apps Script Production, sau đó alias `dongbac.vercel.app` cut-forward theo phê duyệt. Root, các route chính, manifest, `/sw.js`, health và session 401 PASS; không Vercel Login và không có HTTP 5xx (chỉ warning `DEP0169` trên request 200 đã biết).
- Authenticated Production QA xác nhận Observability hiển thị đúng job `ĐÃ HỦY`; Báo cáo có Tổng Hợp Xe, không còn lỗi header và các ô số liệu `Lãi sau lương` dương có computed color `rgb(2, 132, 199)`. Rollback READY: Vercel `dpl_By46eeK9wbaq4YCMqdEZZLPbXxM1`, Apps Script `@344`.

### Đồng bộ schema Báo cáo và chuẩn hóa tìm kiếm — Production 2026-08-28

- Live audit bằng Google Sheets metadata/header/formula xác nhận workbook Vận tải có 42 sheet. Hai nguồn mới ngày 28/08 là `SYS_AggLuongThangXe` (`A:J`, helper phân bổ lương tài xế theo xe) và `BC_TongHopDuAn`, trong đó `A:G` là tổng hợp nhóm, `I:O` là chi tiết dự án. `BC_TongHopXe` hiện có 14 cột `A:N` với `Chi phí lương lái`/`Lãi sau lương`; `BC_BangLuong` có đủ 16 cột `A:P` gồm `BHXH`, `Công ty`, `Ghi chú`.
- Apps Script report bundle nay đọc đủ 14 cột xe, tách độc lập hai bảng dự án, thêm cả hai vào Supabase payload/source metadata và freshness fingerprint. Khoảng nhiều tháng gộp nhóm theo `Công ty + Nhóm báo cáo`, dự án theo `Công ty + Nhóm báo cáo + Dự án`; tỷ trọng doanh thu được tính lại từ doanh thu đã gộp.
- Next Báo cáo thêm tab `Dự Án` gồm hai card `Tổng Hợp Theo Nhóm` và `Chi Tiết Theo Dự Án`, có lọc công ty, tìm kiếm, tổng dòng và export như các báo cáo row-level khác. Hai cột mới của Tổng hợp xe không còn bị backend cắt mất.
- Tìm kiếm được chuẩn hóa cho Báo cáo, Vận hành, Danh mục và giao dịch Thu Chi: nhiều từ khóa ngăn cách bằng dấu phẩy/chấm phẩy/dấu `|`/xuống dòng dùng logic OR; không phân biệt dấu tiếng Việt và bỏ qua dấu chấm/gạch/khoảng trắng của biển số. Báo cáo áp dụng tìm kiếm cho mọi card thay vì chỉ Lương/Xe.
- Workbook Thu Chi live có thêm `PHANBO_VAY`, nhưng đây là bảng công thức lập phương án, không phải nguồn giao dịch. Checkpoint này chỉ ghi nhận contract và không cho web app ghi vào sheet đó; nếu cần UX phân bổ trả nhiều khoản thì phải duyệt một business-flow riêng.
- Full gate PASS 537/537 tests, ESLint không warning, typecheck, Next production build, Environment Identity Guard và `git diff --check`. Không sửa tên/thứ tự cột/công thức hoặc dữ liệu Google Sheet; không migration Supabase.
- Apps Script Preview đã lên version bất biến `@344`; Vercel Preview `dpl_7FNBS2av7nEaPSwdbd1jbLDtG1Fr` được triển khai chỉ bằng `npm run deploy:preview`. Public smoke PASS: HTTP 200, title `Vận tải Đông Bắc`, health đúng environment identity, không Vercel Login và session không cookie trả 401.
- Worker freshness tự nhận schema output mới, backfill lại bundle 05–08/2026 và `Tất cả` vào Supabase. Authenticated Preview QA xác nhận 05/2026 và 06/2026 đã có đủ schema xe 14 cột; 08/2026 có hai bảng Dự Án; khoảng 07–08 gộp duy nhất theo khóa. Đối chiếu mẫu: Quang Quân / Dự án nhỏ = `141.999.580`, Quang Quân / VC Việt Bắc = `50.239.200`.
- Tìm `20H-05664, 20H.05602` tại Tổng Hợp Xe khoảng 07–08 trả đúng hai xe bất kể dấu phân cách biển số và dòng tổng được cộng lại đúng. Bảng lương hiển thị cột `BHXH`; bảng xe hiển thị `Chi phí lương lái`/`Lãi sau lương`; console không có error/warning.
- Sau phê duyệt riêng, Apps Script Production canonical được cập nhật từ `@343` lên candidate bất biến `@344`. Vercel Production artifact `dpl_By46eeK9wbaq4YCMqdEZZLPbXxM1` được build bằng Production environment và endpoint Apps Script Production rồi alias `dongbac.vercel.app` được cut-forward; Preview giữ nguyên `dpl_7FNBS2av7nEaPSwdbd1jbLDtG1Fr`/`@344`.
- Public Production smoke PASS cho root, Dashboard, Báo cáo, Vận hành, Danh mục, Quỹ, Cài đặt, Observability, manifest và service worker; session không cookie trả 401; direct/Vercel health đúng app/Supabase/Vercel/Apps Script identity và không Vercel Login. Không có HTTP 5xx; chỉ còn warning `DEP0169 url.parse()` đã biết trên request 200.
- Authenticated Production QA PASS: 08/2026 có hai bảng Dự Án; khoảng 07–08 gộp đúng Quang Quân / Dự án nhỏ `141.999.580` và VC Việt Bắc `50.239.200`; tìm kiếm nhiều biển số PASS tại Báo cáo, Vận hành, Danh mục và Thu Chi với dấu chấm/gạch khác nhau. Console không có error/warning; không ghi dữ liệu nghiệp vụ.
- Rollback READY: Vercel `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR`, Apps Script `@343` trên cùng production deployment ID.

### Khắc phục mất hàng đợi Thu Chi — Production 2026-08-27

- Live audit sau khi trigger được cấp lại quyền cho thấy cache Vận tải đã mới nhưng các bundle Quỹ `fund_overview`, `fund_transactions` và `fund_loans` tháng 07–08 vẫn cũ khoảng 13 giờ, trong khi heartbeat báo `fund pending=false`.
- Nguyên nhân gốc nằm trong `syncRealtimeCache()`: một tick gọi `claimDue()` cho cả queue Vận tải và Thu Chi trước khi chọn việc. Khi cả hai cùng đến hạn, cả hai property đều bị xóa nhưng hàm trả về ngay sau khi chạy Vận tải; item Thu Chi vì thế bị mất mà không sync hoặc requeue.
- `ManualReportRefreshQueueService.claimNextDue()` nay chỉ claim đúng một queue mỗi tick, giữ nguyên queue chưa chạy và luân phiên ưu tiên `transport`/`fund` bằng Script Property. Cơ chế không còn làm mất việc và cũng tránh Thu Chi bị Vận tải chiếm ưu tiên liên tục.
- Bổ sung regression test mô phỏng hai queue cùng đến hạn: tick đầu chỉ lấy Vận tải, Thu Chi vẫn tồn tại; tick sau ưu tiên và lấy Thu Chi. Full gate PASS 534/534 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`.
- Backfill read-only từ workbook Thu Chi bằng `syncAllFundBundlesToSupabase()` hoàn tất lúc 23:41; Observability xác nhận `latest`, `recent_500` và toàn bộ bundle tháng 05–08/2026 đều OK với timestamp mới. Authenticated Preview và Production Quỹ cùng hiển thị dữ liệu 08/2026 cập nhật lúc 23:38 từ Supabase.
- Apps Script Preview và Production cùng deployment version bất biến `@343`; rollback Production là `@340`. Vercel Preview là `dpl_EDcwpzoXhB188K7u8V3AzcTY67FQ`; Vercel Production giữ nguyên `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR` READY vì frontend/API proxy không đổi.
- Public Production smoke PASS cho root, `/manifest.json`, service worker, session 401, direct Apps Script health và Vercel health; đúng app/Supabase/Vercel/Apps Script identity, không Vercel Login. Không đổi cấu trúc, tên cột, công thức hoặc dữ liệu nghiệp vụ Google Sheet; không có migration Supabase.

### Phân loại chính xác và khôi phục lỗi quyền đồng bộ — Preview 2026-08-27

- Live audit xác nhận cả Apps Script Production `@340` và Preview cũ trả HTTP 403 với trang Google `Bạn cần có quyền truy cập`; heartbeat `realtime_cache_worker` dừng khoảng 10:49 ngày 27/08. Vercel health Production trả 502 và GitHub watchdog run `33063750856` thất bại ba lần với cùng 403.
- Không có code/deployment mới giữa lượt watchdog thành công ngày 26/08 và sự cố ngày 27/08. Manifest vẫn khai báo `ANYONE_ANONYMOUS`/`USER_DEPLOYING`; redeploy Preview thành `@341` không thay đổi 403. Tài khoản clasp hiện hành `vipmoschino@gmail.com` thấy project/deployment nhưng `clasp run health --nondev` bị từ chối quyền thực thi. Kết luận hiện tại là project/deployment access hoặc tài khoản triển khai bị chặn; chưa có bằng chứng đủ để kết luận OAuth bị thu hồi.
- Apps Script client nay giữ mã lỗi an toàn `APPS_SCRIPT_ACCESS_DENIED` cùng upstream status mà không lộ HTML/secret. Watchdog dùng trạng thái riêng `deployment_access_denied`; chỉ dùng `authorization_required` khi Apps Script trả thông điệp OAuth rõ ràng. Notification phân biệt `Kết nối Apps Script bị chặn` với `Đồng bộ cần được cấp lại quyền` và hướng dẫn đúng hàm `recoverSyncInfrastructure()`.
- Thêm `diagnoseSyncAuthorization()` read-only, chỉ chạy trong Apps Script editor/Execution API và không đăng ký public action. Hàm trả authorization status, authorized scopes và danh sách trigger để phân biệt OAuth với trigger/deployment access.
- Đúng owner/deployer `ngotuong077@gmail.com` đã cấp lại quyền và chạy `diagnoseSyncAuthorization()` thành công lúc 23:11. Apps Script Executions xác nhận `syncRealtimeCache` và `processWriteJobs` tự chạy lại theo phút; các lượt 23:11–23:14 hoàn thành liên tiếp. Direct health và health qua Vercel của cả Preview/Production đều trở lại HTTP 200 đúng identity.
- Manual watchdog run `33092204376` SUCCESS và chuyển `external_sync_watchdog` về OK với thông điệp `Worker đồng bộ đang hoạt động.` Observability Production lúc 23:15 xác nhận cache mới, `realtime_cache_worker` OK, notification/transport/fund sync tiếp tục và không có write job pending/failed; cảnh báo chưa đọc giảm 57→56 sau khi lỗi hệ thống cũ được loại.
- Full gate PASS 533/533 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Apps Script Preview `@341`; Vercel Preview `dpl_2bK8KUfYA9Nx6QPneN1muWp3cWNM` root/title/health PASS. Production giữ nguyên Vercel `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR` và Apps Script web deployment `@340`; không thay đổi Google Sheet/Supabase schema/data.
- Còn gate Production riêng: code phân loại `deployment_access_denied` và notification mới chỉ nằm trên Vercel Preview; chỉ cut-forward Production sau phê duyệt riêng. Trigger Apps Script chạy source hiện hành `@341`, còn web deployment Production vẫn bất biến `@340`.

### Báo cáo Tổng Quan đồng nhất màu nhãn Danh mục — Production 2026-08-22

- Toàn bộ text trong cột `Danh mục` của bảng Báo cáo Tổng Quan dùng màu chuẩn `#0f172a`, đồng nhất với các bảng dữ liệu khác; màu semantic của các ô số liệu vẫn được giữ nguyên.
- Gate Preview PASS 531/531 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Authenticated Preview QA xác nhận cả 12 nhãn danh mục có computed color `rgb(15, 23, 42)` và không ảnh hưởng màu số liệu.
- Preview Vercel `dpl_8X9oAe5ziTmDTP27j9uD4ZkkCuTE`; Production candidate đóng gói riêng với endpoint Apps Script Production là `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR`, sau đó alias `dongbac.vercel.app` được cut-forward theo phê duyệt.
- Public Production smoke PASS: root và Dashboard/Báo cáo/Vận hành/Danh mục/Quỹ/Cài đặt đều HTTP 200, không chuyển Vercel Login; session không cookie trả 401; health trả 200 và xác nhận đúng app, Supabase, Vercel project, môi trường Production và Apps Script Production `@340`.
- Rollback Vercel gần nhất `dpl_CogE124n97QyuRL8QSW4tCpcKYmv` vẫn READY. Không thay đổi Apps Script, Supabase schema hoặc Google Sheet.

### Báo cáo mặc định tháng hiện tại và tổng hợp Lương/Xe theo khoảng — Preview 2026-08-22

- Báo cáo mở mặc định ở tháng dữ liệu hiện tại `08/2026`, quick filter hiển thị `Tháng này`; tiêu đề và ma trận chỉ hiện tháng 8 cùng cột Tổng.
- Hai nhãn tháng dùng lớp hiển thị tuyệt đối cao 100% và flex căn giữa; authenticated mobile QA 390×844 xác nhận cả hai có `centerDelta=0`, font 14px/500 và trang không tràn ngang.
- Khoảng nhiều tháng không còn nối lặp các dòng Lương/Xe. Lương gộp theo `Nhân sự + Chức vụ + Công ty`; Xe gộp theo `Công ty + Biển số`; mọi cột số được cộng, ghi chú khác nhau được hợp nhất.
- Authenticated QA 07/2026–08/2026 có 31/31 khóa Lương duy nhất và 15/15 khóa Xe duy nhất. Đối chiếu thật: Huy `32.290.000 + 21.000.000 = 53.290.000`; xe `20H05664` `110.482.358 + 269.168.432 = 379.650.790`.
- Preview Vercel `dpl_4v2MQR5qZVqeBvLHfbVwKbBcVnQN`; Production giữ nguyên `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`; Apps Script giữ nguyên `@340`, không thay đổi Google Sheet.
- Gate PASS 531/531 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`; console Preview không có error/warning.

### Báo cáo tinh chỉnh typography và căn chỉnh ma trận — Preview 2026-08-21

- Hai ô chọn tháng hiển thị thống nhất `MM/YYYY`, dùng cùng font 14px/500 với bộ lọc nhanh và không còn chữ `Tháng`/uppercase trong control.
- Cột `Danh mục` của ma trận Tổng Quan giảm từ 210px xuống 176px; toàn bộ nhãn cột và số liệu căn trái.
- `Lợi Nhuận Gộp` và `Lợi Nhuận Thực` vẫn giữ semantic màu chữ/độ đậm nhưng không còn nhận lớp nền `total-row`.
- Khi khoảng chỉ có một tháng, tiêu đề dùng dạng `(08/2026)`; ma trận chỉ hiện `Danh mục`, `Tháng 8`, `Tổng`.
- Authenticated Preview QA xác nhận computed typography hai control giống nhau, cột đầu đúng 176px, header/số liệu `text-align: left`, hai dòng lợi nhuận không có `total-row`, console không lỗi. HTTP 200, title `Báo cáo · Vận tải Đông Bắc` và không chuyển Vercel Login.
- Preview Vercel `dpl_AMh8SapMaTrb3wPwRr7QivApE6hs`; Production giữ nguyên `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`; Apps Script Preview/Production giữ nguyên `@340`, không thay đổi Google Sheet.
- Gate PASS 531/531 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`.

### Báo cáo chỉ hiện tháng có dữ liệu, lợi nhuận và bộ lọc quý — Preview 2026-08-21

- `Báo Cáo Tổng Quan` chỉ hiển thị các tháng có ít nhất một giá trị số; cột đổi thành `Tháng 1`, `Tháng 2`, … và cột cuối thống nhất là `Tổng`. Khoảng 06/2026–07/2026 chỉ có đúng `Tháng 6`, `Tháng 7`, `Tổng`.
- Bổ sung `Lợi Nhuận Gộp` và `Lợi Nhuận Thực` vào matrix Tổng Quan. Nếu source chưa có cột, web suy ra theo đúng semantics Báo cáo Chi tiết: lợi nhuận gộp trừ thuế, dầu Quang Minh, phí đi đường/phường; lợi nhuận thực tiếp tục trừ dầu ngoài, lương và Chi Quỹ. Source đã có lợi nhuận thì được giữ nguyên.
- Bộ lọc dùng cùng bố cục hai tầng với Vận hành/Quỹ: hàng trên là khoảng tháng và bộ lọc nhanh `Năm nay`, `Quý 1`–`Quý 4`, `Tùy chọn`; hàng dưới là tìm kiếm. Quý không có tháng dữ liệu bị disabled; control giữ hit target 44px và không phát sinh page-level horizontal overflow.
- Authenticated Preview QA PASS với dữ liệu thật: Năm nay chỉ hiện Tháng 5–8; Quý 2 hiện Tháng 5–6; Quý 3 hiện Tháng 7–8. Khoảng 06–07 có Lợi nhuận gộp `1.335.629.019` và Lợi nhuận thực `-11.807.866`, khớp Báo cáo Chi tiết; mobile 390×844 không tràn trang, table scroll riêng và console sạch.
- Full gate PASS 531/531 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview `dpl_BtUtVyehu2iaWDf281erLVY6kyQL`; Apps Script Preview giữ `@340`; Production giữ nguyên `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`/`@340`.
- Hai Preview trung gian `dpl_AgF5ZkqKkPafWBU4YDDBAJDcgbKg` và `dpl_AbjHt7PoNkQYHr9fZa67NJKg63WK` bị loại trong QA vì lần lượt lọc mất dòng lợi nhuận và để cascade co hit target. Rollback Preview an toàn là candidate đã duyệt trước `dpl_Dipc9qMB58hYUA8cxBCaJucGpFWJ`.

### Báo cáo ma trận 12 tháng và lọc khoảng tháng — Production 2026-08-21

- `Báo Cáo Tổng Quan` trên web đã chuyển từ mỗi tháng một dòng sang ma trận: `Danh mục`, T01–T12 và `Tổng năm`. Tên danh mục lấy nguyên từ matrix backend; tháng chưa có dữ liệu hiển thị `—` và không bị cộng như số 0 giả.
- Toolbar Báo cáo có hai bộ lọc `Từ tháng`/`Đến tháng` và nút `Cả năm`. Cả năm hiển thị đủ 12 tháng; khoảng tùy chọn chỉ hiển thị các tháng trong kỳ cùng `Tổng kỳ`.
- Khoảng tháng được ghép server-side từ đúng các `report_bundles` tháng trong Supabase. Báo cáo Chi tiết dùng cùng semantics cộng từng tháng của Apps Script; Bảng lương và Tổng hợp xe ghép đúng source rows. Request fail-closed nếu khoảng đảo chiều, endpoint không tồn tại hoặc thiếu bundle tháng; không đọc/ghi `BC_TongQuan!B1`, không sửa Google Sheet và không có migration.
- Authenticated Preview QA PASS tại 1440×900 và mobile 390×844. Sau phê duyệt riêng, authenticated Production QA cũng PASS trên desktop và mobile 390×844: Cả năm có `Danh mục`, T01–T12, `Tổng năm`; khoảng 06/2026–07/2026 có `T06`, `T07`, `Tổng kỳ`, Tổng doanh thu `2.638.752.743` khớp Báo cáo Chi tiết. Không có console error.
- Full deploy gate PASS 530/530 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview giữ `dpl_Dipc9qMB58hYUA8cxBCaJucGpFWJ`; Apps Script Preview/Production giữ `@340`. Production candidate được đóng gói riêng với endpoint Apps Script Production thành `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`, rồi alias `dongbac.vercel.app` mới được cut-forward.
- Public Production smoke PASS cho root, Dashboard, Báo cáo, Vận hành, Danh mục, Quỹ, Cài đặt, Observability, `/manifest.json`, service worker, session 401, health/identity và watchdog 401. Health xác nhận đúng app/Supabase/Vercel Production/Apps Script Production. Không có HTTP 5xx; chỉ có warning `DEP0169` đã biết trên request health HTTP 200.
- Rollback READY: Vercel `dpl_C7ovMrnmLjveFr6soZQijTtLcmba`; Apps Script không đổi và vẫn có `@338` trên cùng deployment ID Production. Rollback Preview riêng là `dpl_Hqp9579pEZqpPnkm8rwsgQ79qTvm`.

### Khôi phục đồng bộ và watchdog ngoài Apps Script — Production 2026-08-21

- Sự cố được xác định không phải bốn pipeline độc lập: toàn bộ trigger Apps Script ngừng chạy sau lượt `syncRealtimeCache` thành công lúc 15:43 ngày 19/08/2026, đồng thời hai web deployment Apps Script trả HTTP 403. Sau khi owner `ngotuong077@gmail.com` cấp lại quyền, trigger `syncRealtimeCache` và `processWriteJobs` tiếp tục chạy mỗi phút từ 10:53 ngày 20/08/2026; các lượt được quan sát liên tiếp đã hoàn thành, health Preview/Production trả HTTP 200.
- Preview authenticated hiển thị `Cập nhật: 10:53 20/08/2026`, xác nhận Supabase đã nhận heartbeat mới. Dữ liệu chuyến hiện có tới ngày 19/08; không suy diễn thiếu ngày 20/08 khi source chưa có dòng mới.
- Trung tâm thông báo gom `realtime_cache_worker` và ba pipeline phụ thuộc thành một cảnh báo nghiệp vụ. Nếu external watchdog xác định Apps Script bị Google chặn quyền, cảnh báo duy nhất là `Đồng bộ cần được cấp lại quyền` với hướng dẫn mở Apps Script và chạy một hàm; không hiển thị tên worker hoặc mã HTTP kỹ thuật.
- Endpoint server-only `/api/sync-watchdog` mỗi 5 phút đọc heartbeat Supabase; worker còn tươi thì chỉ xác nhận trạng thái, worker stale thì gọi action admin `recoverSyncInfrastructure` để cài lại trigger và chạy một lượt sync. Watchdog ghi trạng thái của chính nó vào `sync_status`, nên trường hợp tự phục hồi thất bại vẫn xuất hiện trong webapp.
- Giới hạn bắt buộc: watchdog tự chữa được trigger bị mất/dừng khi Apps Script vẫn còn quyền; không thể tự cấp lại OAuth nếu Google thu hồi quyền của owner. Trong trường hợp này hệ thống phải phát hiện trong tối đa khoảng 10–15 phút và hướng dẫn cấp lại quyền, thay vì im lặng dừng hơn 18 giờ.
- Recovery đã được harden fail-closed: top-level không thể báo thành công khi sync con lỗi; heartbeat vẫn được ghi khi queue liên tục có việc; lỗi OAuth dùng trạng thái `authorization_required`, còn lỗi hạ tầng tạm thời không bị gắn nhầm nhãn cấp lại quyền.
- Watchdog dùng `SYNC_WATCHDOG_SECRET` riêng tại Vercel/GitHub, không coupling với `CRON_SECRET`/notification dispatch. Workflow `.github/workflows/sync-watchdog.yml` đã được GitHub xác nhận `state: active` với lịch 5 phút; manual workflow run `32491734847` trên commit `8574d9a` đã SUCCESS. Event `schedule` đầu tiên chưa xuất hiện trong cửa sổ quan sát 5 phút sau cut-forward, nên độ trễ thực tế của GitHub scheduler vẫn phải tiếp tục theo dõi.
- Apps Script Preview và Production cùng version bất biến `@340`. Vercel Preview `dpl_Hqp9579pEZqpPnkm8rwsgQ79qTvm`; Vercel Production `dpl_C7ovMrnmLjveFr6soZQijTtLcmba`.
- Full gate PASS 527/527 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview forced-recovery canary PASS; Production fresh-skip qua GitHub Actions PASS; endpoint thiếu bearer trả 401.
- Public Production smoke PASS cho root, route chính, `/manifest.json`, service worker, session 401, health/identity và watchdog 401. Authenticated admin QA PASS trên Dashboard/Observability: `external_sync_watchdog` và `realtime_cache_worker` đều OK, write queue không có pending/failed, không có console error. Vercel không có HTTP 500; chỉ còn warning `DEP0169` đã biết.
- Rollback còn READY: Vercel `dpl_9TNAVm9ifWXWxKx5Knzw57j8Vkio`; Apps Script `@338` trên cùng deployment ID Production.

### Business form sheet system — Preview 2026-08-16

- Toàn bộ form ghi dữ liệu mobile của Vận hành, sửa Vận hành, Danh mục, Thu/Chi, Khoản vay và Trả vay dùng chung `data-business-form-sheet` và một contract duy nhất trong `platform.css`; drawer chỉ cao theo nội dung và chỉ clamp khi vượt `92dvh`.
- Typography/mật độ được khóa: title 18/700, group title 14/700, label 11.5/600, control 16/500, input/select/date 44px và textarea 64–112px. Footer theo ngay sau nội dung, cao 60px có iOS safe-area; từ 360px dùng hai cột và dưới 360px chuyển một cột.
- `useSwipeDismiss` cho phép vuốt xuống từ handle hoặc vùng trống không tương tác khi scroll đang ở đầu; input/select/textarea/button/link không bị gesture chiếm quyền.
- Contract được ghi tại `docs/contracts/BUSINESS_FORM_SHEET_CONTRACT.md` và router AI đã dẫn tới tài liệu này để tránh tạo override riêng theo module.
- Lớp thử nghiệm `Fluent Mica` dùng đúng phân vai vật liệu: Smoke cho backdrop, Acrylic có kiểm soát ở vỏ/header/footer, Mica gradient xanh ngọc–xanh lam có thể nhận biết cho canvas, dải accent 3px và Solid hoàn toàn cho input/select/textarea. Không dùng iridescence, chromatic aberration, morphing hoặc blur trên trường nhập.
- Bản đầu `dpl_FRo4kzJ9GoGDR5UAXermk2SxGpAs` bị loại vì gradient trắng 94–96% bị card đặc che nên gần như không thể nhận biết trên thiết bị thật. Bản hiệu chỉnh `dpl_EXo4L7LSKHuN1vYkKDK3bhxKt5UD` phát sinh hồi quy do lớp trang trí đặt `position: relative` lên drawer Vận hành, khiến drawer nằm dưới viewport; selector đã được sửa để không can thiệp positioning contract.
- Full gate PASS 516/516 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview hiện hành `dpl_Sx3Kf6jW9LsP8kMV83efkcZ19xoS` đã bỏ nhãn thừa `Ngày mới nhất` khỏi tiêu đề bảng chuyến nhưng vẫn giữ ngày dữ liệu; Apps Script giữ `@338`; Production giữ nguyên `dpl_9TNAVm9ifWXWxKx5Knzw57j8Vkio`.
- Authenticated QA tại 390×844: Vận hành form ngắn tự co còn 553px, Danh mục tự co 621px, Thu/Chi tự co 602px; footer/body liền nhau, control 44px/16px, label 11.5px/600, không tràn ngang và không có console error. Không ghi dữ liệu nghiệp vụ.
- Authenticated QA bổ sung trên Preview Fluent tại 390×844: form Thu/Chi vẫn cao 602px, không tràn ngang; select/text input 44px/16px, nền trường nhập trắng đặc và không nhận backdrop blur; shell dùng gradient nhẹ, footer/header dùng blur giới hạn. Không ghi dữ liệu nghiệp vụ.
- Authenticated regression QA tại 390×844: drawer Vận hành là `position: fixed`, nằm trong viewport từ 156,625px đến 844px, z-index 1010, không tràn ngang; test mới cấm lớp Fluent ghi đè positioning contract.

### Tổng hợp ngày D−1 lúc 12:00 với số liệu Vận tải và Quỹ — Production 2026-08-16

- Daily summary nay tổng hợp đúng ngày hôm trước theo múi giờ Việt Nam, kể cả khi qua ranh giới tháng/năm. Vận tải đọc `XL_VanChuyen` để tính số chuyến, doanh thu ước tính, số xe, khối lượng và số dự án.
- Phần Quỹ lấy đúng `fund_overview_bundles` của tháng chứa ngày D−1 rồi cộng các chi tiết đúng ngày; ngữ nghĩa Thu/Chi giữ cùng KPI Quỹ hiện hành, gồm cả nghiệp vụ vay/trả thay vì chỉ đọc `NHAP_THUCHI`. Khi bundle Quỹ chưa có, nội dung nói rõ chưa có dữ liệu thay vì hiển thị số 0 sai.
- Dispatcher chỉ phát trong giờ 12:00 Việt Nam ở lượt trigger năm phút đầu tiên chạy được, thường trong vòng 0–5 phút sau 12:00. Delivery key gắn với ngày D−1 nên các tick còn lại không phát trùng.
- Nội dung có dạng: `12,5 chuyến · doanh thu 32.000.000 đ · chi Quỹ 7.000.000 đ · thu Quỹ 5.000.000 đ · 4 xe · 300,25 m³ · 3 dự án.`; nếu không có summary ngày hôm trước thì báo rõ chưa có dữ liệu tổng hợp.
- Cài đặt đổi nhãn thành `Tổng hợp ngày hôm trước`, mô tả rõ lịch 12:00 và các chỉ số. Authenticated Preview QA xác nhận nhãn/mô tả hiển thị đúng trong tab Thông báo.
- Full gate PASS 510/510 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Apps Script Preview/Production cùng dùng version bất biến `@338`; Vercel Preview giữ `dpl_5w73mAgUpdM9mQgWA1LKYyecmf76`.
- Sau phê duyệt riêng ngày 2026-08-16, Apps Script Production canonical được cập nhật lên `@338`; Vercel Production artifact `dpl_9TNAVm9ifWXWxKx5Knzw57j8Vkio` đóng gói đúng endpoint Production và alias `dongbac.vercel.app` đã cut-forward. Root, các route chính, manifest, service worker, session 401, direct/Vercel health và log 5xx đều PASS.
- Authenticated Production smoke PASS tại Cài đặt: đúng tài khoản hiện hành, hiển thị `Tổng hợp ngày hôm trước` cùng mô tả lịch 12:00, không tràn ngang và không có console error. Không phát thông báo thử và không ghi dữ liệu nghiệp vụ. Rollback gần nhất là Vercel `dpl_85PsF73o52beq8SuKrK8915nzu4f` và Apps Script `@337`.

### Chuyển tháng Báo cáo tức thời, cache/prefetch và chống stale UI — Preview 2026-08-15

- Đã loại nguyên nhân trạng thái `nhãn 08 nhưng hàng vẫn là 07`: tháng đang chọn và tháng thật sự thuộc về bundle hiển thị được theo dõi riêng. Bundle chỉ render khi hai tháng khớp; đổi sang tháng chưa cache gỡ hàng cũ ngay trong cùng thao tác và thay bằng skeleton đúng khung, không thêm ghi chú kỹ thuật lên giao diện.
- Bundle ban đầu được seed vào client cache; hai tháng lân cận được prefetch nền sau 250 ms. Khi cache đã sẵn sàng, chọn tháng đổi toàn bộ bảng tức thì, không có skeleton trung gian.
- Hook dùng chung `useLatestAsyncRequest` hủy `AbortController` của request cũ và khóa chỉ request mới nhất được phép cập nhật UI. Chuyển nhanh `Tất cả → 08/2026` đã xác nhận kết quả cũ không ghi đè lựa chọn cuối.
- Dữ liệu mới dùng hiệu ứng opacity/translate 180 ms `ease-out`; `prefers-reduced-motion` tắt animation. Skeleton giữ nguyên card theo tab đang xem và không tạo layout shift/horizontal overflow.
- Full gate PASS 507/507 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Vercel Preview `dpl_DhqBGJ5x4hUeUR2vuS2W5iZEpPiC`; Apps Script Preview giữ `@337`; Production giữ nguyên `dpl_85PsF73o52beq8SuKrK8915nzu4f`.
- Authenticated Preview QA PASS: tháng chưa cache hiện 4 skeleton với 0 report cũ; sau tải, cả bốn title và hàng dữ liệu cùng đúng tháng; tháng lân cận đổi không loading; rapid-switch giữ đúng lựa chọn cuối; mobile 390×844 không tràn ngang; console không có error.

### Dashboard month range, unread badge và daily business digest — Production cut-forward 2026-08-15

- App badge đã được sửa theo cùng ngữ nghĩa với badge chuông: client ghi số chưa đọc tuyệt đối; push mới chỉ cộng số item mới; daily digest không tăng badge vì không tạo item chưa đọc trong panel. Service worker chỉ lưu một `{count}` cục bộ, không cache request/dữ liệu ứng dụng.
- `DailyBusinessSummaryService` chỉ đọc tối đa 20.000 dòng cuối của `XL_VanChuyen` bằng `SpreadsheetApp.openById`, lọc đúng ngày Việt Nam và tổng hợp số chuyến, số xe, khối lượng, doanh thu ước tính và số dự án vào `manage_data_bundles/daily-summary:latest`. Dispatcher 20:00 dùng các số nghiệp vụ này thay cho thống kê cảnh báo chung.
- Tổng quan thay bộ lọc một tháng bằng icon thanh trượt 44px mở bottom drawer `Từ tháng`–`Đến tháng`; không có text `Tùy chỉnh`. Khoảng chọn cộng đúng các dòng tháng hiện có của `BC_TongQuan` cho toàn bộ KPI và hai biểu đồ tài chính, đồng thời so sánh với khoảng liền trước có cùng số tháng. `Tất cả kỳ` chọn toàn bộ dữ liệu; bảng chuyến được ghi rõ là ngày mới nhất và không giả vờ thuộc kỳ tài chính.
- Drawer dùng portal, focus/Escape, vuốt xuống, exit animation, safe-area và reduced-motion; hai select giữ contract text trái/chevron phải và không tạo horizontal overflow theo source/CSS gate.
- Full gate PASS 506/506 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Vercel Preview `dpl_63VnfiF19ySzhzcEMJiP9PADGXSe`; Apps Script Preview `@337`. Version `@336` bị loại vì `clasp push` đã skip trước khi tạo version; `@337` được force-push và clone ngược xác nhận đủ 52 files gồm service mới.
- Public Preview smoke và health trực tiếp/qua Vercel PASS đúng app/Supabase/Vercel/Apps Script Preview fingerprint. Authenticated QA ngày 2026-08-15 PASS ở desktop 1440x900 và mobile 390x844: chọn `06/2026–08/2026` tổng hợp 3 tháng, biểu đồ hiện đủ 3 nhãn tháng, trigger 44x44, hai select cao 44px/căn trái/cùng hàng, drawer không tràn ngang và exit animation hoàn tất trước khi tháo DOM.
- Authenticated notification smoke giữ nguyên 42 thông báo/41 chưa đọc sau khi mở rồi đóng panel; số trên chuông là 41. Không đánh dấu đã đọc, không phát daily push thủ công và không ghi dữ liệu nghiệp vụ trong lượt QA.
- Sau phê duyệt riêng, Apps Script Production được cập nhật đúng deployment canonical lên `@337`; Vercel Production artifact mới `dpl_85PsF73o52beq8SuKrK8915nzu4f` đóng gói endpoint Apps Script Production và alias `dongbac.vercel.app` đã cut-forward. Root, các route Dashboard/Báo cáo/Vận hành/Danh mục/Quỹ/Cài đặt, manifest, service worker, session 401, direct/Vercel health và log 5xx đều PASS. Preview giữ nguyên `dpl_63VnfiF19ySzhzcEMJiP9PADGXSe`; rollback READY là Vercel `dpl_4LQnv87HMgV96P5rVvc2m83WDhK2` và Apps Script `@335`.
- Authenticated Production smoke ngày 2026-08-15 PASS cho auth hydration, Tổng quan `06/2026–08/2026` (390.631.126 đồng và đủ ba nhãn tháng), chuông 42 chưa đọc không đổi sau mở/đóng, responsive không tràn ngang, Quỹ/date control, bộ lọc Chức vụ và dòng `Dương Công Tiến Nội`. Đối chiếu lại bảng lương theo từng cell xác nhận tháng 08/2026 có đủ Ứng lương: La Văn Bằng 8.500.000, Vi Văn Độ 8.000.000, Lê Văn Lợi 10.000.000, Trần Thế Anh 3.000.000 và Dương Công Tiến Nội 2.000.000 đồng, khớp `BC_BangLuong` người dùng xác nhận. Kết luận thiếu dữ liệu trước đó bị hủy: QA đã đọc chuỗi text nối liền của cả row và đọc ngay khi nhãn tháng đổi trước khi bundle hàng hoàn tất chuyển từ 07 sang 08.

### Bộ lọc Chức vụ và đồng bộ Thu Chi → bảng lương — Production hoàn thành 2026-08-14

- Bảng `Tổng Hợp Lương` có thêm bộ lọc `Chức vụ`, dùng cùng compact/adaptive select contract với bộ lọc Công ty. Hàng `Tổng cộng` tại cột `Chức vụ` đếm số nhân sự thực tế đang hiển thị sau mọi bộ lọc.
- Edit `NHAP_THUCHI` nay queue báo cáo Vận tải sau 30 giây thay vì 2 phút và mang `verificationPasses=1`. Worker chạy lượt đầu ở tick một phút kế tiếp rồi bắt buộc hậu kiểm cùng scope sau 2 phút, tránh Supabase giữ snapshot trước khi chuỗi `IMPORTRANGE`/công thức lương hoàn tất. Poll 5 phút vẫn là safety net; frontend tiếp tục tự đọc lại Supabase mỗi 60 giây và nút Làm mới không đọc trực tiếp Google Sheet.
- Target SLA: lượt đầu thường xuất hiện trên webapp trong khoảng 1–3 phút tính cả frontend revalidation; lượt hậu kiểm khoảng 3–5 phút. Quota/contention hoặc Google Sheets tính chậm có thể kéo dài hơn nhưng không còn phụ thuộc một lần chụp duy nhất.
- Full gate PASS 502/502 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Authenticated Preview QA xác nhận bộ lọc có đủ `Người tuyển`/`Quản lý`/`Tài xế`; chọn `Tài xế` tại 07/2026 còn 24 nhân sự và hàng tổng đổi đúng.
- Hai khoản ứng lương từng được dùng làm canary hiện được xác nhận lại ở kỳ bảng lương `08/2026`: `La Văn Bằng` 8.500.000 đồng và `Vi Văn Độ` 8.000.000 đồng, khớp `BC_BangLuong`. Kết luận cũ rằng chúng thuộc 07/2026 là sai do QA chuyển tháng nhưng đọc hàng trước khi request bundle mới hoàn tất.
- Apps Script Preview và Production cùng lên version `@335`. Vercel Preview `dpl_9vsYkHFk82PMJhs4PeUd4HqJJWdj`; Vercel Production `dpl_4LQnv87HMgV96P5rVvc2m83WDhK2`. Public Production smoke PASS root, các route chính, `manifest.json`, service worker, health đúng identity/Apps Script Production; session và push không cookie trả 401, không có request 5xx trong cửa sổ cut-forward. Authenticated Production chưa chạy vì cookie Preview không dùng chung domain.

### Report formula eventual consistency và bảng lương — Preview hoàn thành 2026-08-14

- Audit live tháng 08/2026 xác nhận Google Sheet và raw report bundle đều có đủ 28 nhân sự. Nguyên nhân riêng `Dương Công Tiến Nội` biến mất trên giao diện là `isTotalRow` từng dùng phép chứa chuỗi `công` để nhận diện dòng `Tổng cộng`, nên tên có chữ `Công` bị loại và tổng phía client thiếu đúng 13.000.000 đồng. Nhận diện dòng tổng nay chỉ khớp nhãn ở đầu ô/đúng nhãn và có regression test cho tên này.
- Edit trực tiếp workbook Vận tải nay giữ một lượt hậu kiểm sau 2 phút. Poll 5 phút fingerprint trực tiếp `BC_TongQuan`, `BC_BangLuong` và `BC_TongHopXe` theo từng tháng, tự queue lại tháng thay đổi cùng `Tất cả` ngay cả khi formula spill không phát sinh edit event mới. Nút làm mới của webapp tiếp tục chỉ tải Supabase theo yêu cầu người dùng.
- `ReportTableService` bỏ giới hạn cứng 200 dòng và đọc tới hàng có month key cuối cùng; regression test 240 dòng ngăn bảng lương cả năm bị cắt khi số nhân sự/tháng tăng.
- Authenticated Preview sync đầu tiên cho thấy overview đã mới nhưng payroll vẫn cũ. Root cause bổ sung: `skipInvalidation` của batch vô tình biến `forceRefresh=true` thành cached read riêng cho report tables. `getReportBundle` nay luôn force-read `BC_BangLuong`/`BC_TongHopXe` khi caller yêu cầu force refresh; `skipInvalidation` chỉ còn đúng nghĩa tránh lặp global eviction.
- Apps Script Preview đã lên `@334`; full report sync hoàn tất. Vercel Preview `dpl_5kVRQWgAJiC4dnzTdj2GW6iybKvC` đã QA authenticated: 29 dòng hiển thị gồm 28 nhân sự + tổng, có `Dương Công Tiến Nội` 13.000.000 đồng; tổng 511,0 chuyến và thực nhận 447.147.000 đồng, khớp workbook/raw API.
- Full deploy gate PASS 501/501 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Production giữ nguyên Vercel `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q` và Apps Script `@328`; chỉ promote khi có phê duyệt riêng.

### Adaptive filter density — Preview hoàn thành 2026-08-13

- Tất cả bộ lọc nghiệp vụ mang contract `platform-content-select` tại Tổng quan, Báo cáo, Vận hành, Danh mục, Quỹ và các drawer nay tự đo nhãn đang chọn rồi co/giãn theo đúng nội dung; không còn lấy chiều rộng của lựa chọn dài nhất hoặc kế thừa chiều rộng toàn cột.
- Contract chung khóa text căn trái, font-weight 500, padding trái 10px, vùng chevron phải 30px và chevron 15px. Bộ lọc trong header/subheader bảng dùng control 36px bên trong vùng chạm 44px; bộ lọc thời gian chính giữ baseline 38px để không phá toolbar ngày/tìm kiếm đã duyệt.
- Observer bao phủ cả route content và body-level portal; lịch thay tab, đổi lựa chọn, thay options, resize và font-ready đều đo lại. Scheduler không hủy frame liên tục nên bộ lọc mới trong tab/drawer không bị chậm vì data render.
- Authenticated Preview QA PASS ở 390x844 và 1440x900: `Tháng này` 122px; Quỹ/Khoản vay các nhãn `Tất cả` khoảng 101px thay vì 147px; Báo cáo `Tất cả công ty` 149px, `Tất cả xe` 110px; đổi `Tất cả` sang `Vay` thu từ 89px xuống 72px rồi đo lại khi đổi về. Text/padding/weight đồng nhất và trang không tràn ngang.
- Full gate PASS 493/493 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_AJypYfEhs4fbnjrco5YaTGmpWXSP`; Production giữ nguyên `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q` và Apps Script `@328`.

### Cashflow settings, Fund rule card và Safari copy fallback — Preview hoàn thành 2026-08-13

- `Thiết lập đầu kỳ` của Quỹ dùng cùng custom date control `dd/mm/yyyy` với các form nghiệp vụ, nên không còn native Safari date text dài; bốn trường cùng chiều cao, label 12px/700, giá trị 16px/500 trên mobile và căn trái. Hai trường số tiếp tục dùng formatter Việt Nam với dấu chấm hàng nghìn.
- `Quy tắc tự động` và phần `Mở rộng quy tắc cảnh báo` nằm trong một card. Pill switch nằm cùng hàng tiêu đề, bỏ hoàn toàn text trạng thái `Đang bật/Đang tắt`; ngưỡng số dư hiển thị `10.000.000` thay vì `10000000`, input/textarea dùng weight 500.
- Backdrop chuông desktop được khóa nền tối trong suốt, không blur và không thể bị generic button hover/focus đổi thành trắng. Safari copy vẫn thử sao chép trực tiếp; nếu user agent chặn, webapp mở vùng fallback có nội dung đã chọn, nút sao chép trực tiếp và hướng dẫn dùng menu native thay vì hiển thị lỗi kỹ thuật tiếng Anh.
- Authenticated Preview QA PASS tại 390x844 và 1440x900: rule không tràn ngang, title/switch cùng hàng, phần mở rộng cùng card, số ngưỡng có dấu chấm, trường đầu kỳ đồng nhất và date hiển thị `28/04/2026`; desktop notification backdrop là `rgba(15, 23, 42, 0.18)`, không filter/box-shadow, panel visible và không có console error.
- Full deploy gate PASS 493/493 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_8TE2uzpGe4FwpoYhK1e9jw5mjKJ3`; Production giữ nguyên Vercel `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q` và Apps Script `@328`.

### Notification mobile entry và Safari clipboard — Preview hoàn thành 2026-08-13

- Nhấn giữ notification trên Safari không còn gọi Clipboard API khi timer hết hạn (thời điểm đó user activation đã mất). Timer chỉ xác nhận long-press; thao tác copy chạy đồng bộ trong `pointerup`, ưu tiên selection + `execCommand('copy')` tương thích iOS rồi mới fallback Clipboard API. Native touch callout bị tắt, vẫn giữ ngưỡng 550 ms, dung sai cuộn 12 px và chống click ngoài ý muốn.
- Notification đối soát chuyến từ panel hoặc Web Push mở `/manage/?entry=vanChuyen`; route Vận hành tự mở đúng bottom drawer `Nhập vận chuyển` trên mobile. Service worker còn chuyển deep link `/entry/` cũ sang route mới để notification đã phát trước checkpoint không mở giao diện desktop độc lập.
- Khi API chấp nhận lệnh `submitRows`, drawer đóng qua exit animation ngay, người dùng quay lại Vận hành và nhận toast `Dữ liệu sẽ được đồng bộ nền`; khối trạng thái job không còn có thể chồng lên form trong overlay mobile. Nếu enqueue lỗi, drawer vẫn mở để giữ dữ liệu và hiển thị lỗi.
- `Số phiếu` là input text với `inputmode=text`, cho phép số, dấu `-` và khoảng trắng; các trường số nghiệp vụ khác vẫn giữ keyboard decimal và định dạng số Việt Nam.
- Authenticated Preview QA PASS tại 390x844: notification `Thiếu chuyến cần kiểm tra` mở đúng drawer mobile, drawer rộng đúng viewport và không tràn ngang, `Số phiếu` giữ nguyên `12- 34`, không có `entry-job-panel` trong drawer, sao chép bằng keyboard cho đúng ba dòng nội dung và không có console warning/error. Không chạy write canary trên workbook thật.
- Full gate PASS 492/492 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_2aLud9TWeStqx2ufVjGvfZ3qseYx`; Apps Script Preview `@331`. Production giữ nguyên Vercel `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q` và Apps Script `@328`.

### Notification dispatch URL và nhấn giữ sao chép — Preview hoàn thành 2026-08-13

- Cảnh báo `notification_pipeline ... Notification dispatch HTTP 405` không phải lỗi Google Sheet. Nguyên nhân là Apps Script gọi endpoint thiếu dấu `/` cuối trong khi Next.js bật `trailingSlash`; redirect từ `/api/notification-dispatch` sang `/api/notification-dispatch/` làm hỏng POST. `NotificationDispatchService` nay tự chuẩn hóa URL có đúng một `/` cuối và giữ nguyên POST.
- Apps Script project HEAD đã nhận bản sửa nên installable time trigger dùng source mới; Apps Script Preview được khóa tại `@330`. Apps Script Production web API vẫn giữ `@328` và Vercel Production vẫn giữ `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q`.
- Lỗi sync không trọng yếu chỉ còn active trong 24 giờ. Lỗi cũ hơn bị bỏ khỏi trung tâm; nếu là worker trọng yếu thì chuyển thành `Dữ liệu chưa được đồng bộ mới` thay vì giữ vô thời hạn thông báo lỗi sự kiện cũ.
- Mỗi notification item hỗ trợ nhấn giữ 550ms để sao chép tiêu đề, ngày, nội dung và metadata chuyến/tiền nếu có. Di chuyển quá 12px hủy gesture để không xung đột cuộn dọc; long press không đồng thời đánh dấu đã đọc. Có pressed feedback, rung xác nhận best-effort, toast `Đã sao chép nội dung thông báo`, fallback clipboard và `Cmd/Ctrl+C` khi item có focus.
- Authenticated Preview QA PASS tại mobile 390x844 và desktop 1280x720: không còn `HTTP 405` hoặc lock timeout ngày 11/08, nội dung sao chép đúng 4 dòng với cảnh báo thưởng, toast hiện đúng, panel nằm trong viewport, trang không tràn ngang, `touch-action: pan-y`, không có console warning/error.
- Full gate PASS 492/492 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_DuAtNhrpdZVRgDWVgdeuL2rxpdcx`; Production Vercel không đổi.

### Trung tâm thông báo đa nguồn, Web Push và daily digest — Production hoàn thành 2026-08-13

- Header đã bỏ icon mở Google Sheet và thay bằng chuông thông báo có badge, panel responsive, loading/error/empty state và đóng bằng backdrop/Escape. UI không hiển thị tên sheet/kỹ thuật cho người dùng.
- `TripNotificationSyncService` chỉ đọc 17 cột công thức của `XL_DoiSoatChuyen`, lấy chênh lệch/thiếu chuyến và thưởng nóng cần kiểm tra trong 45 ngày gần nhất. `OperationalNotificationSyncService` chỉ tin cột công thức `Lưu ý` của `NL_ChamCong` và `Kiểm tra` của `NL_PhanCongLai`; không tự suy diễn quy tắc chấm công/phân công. Hai service chỉ ghi bundle Supabase, không ghi, đổi công thức hoặc cấu trúc Google Sheet.
- Worker `syncRealtimeCache` cập nhật bundle tối đa mỗi 5 phút; frontend action proxy-local `getNotifications` xác thực session/RBAC rồi chỉ đọc Supabase.
- Panel có hai tab `Tất cả`/`Chưa đọc`, đánh dấu từng thông báo hoặc tất cả đã đọc; thao tác đánh dấu tất cả và làm mới dùng hai icon 44px trên cùng toolbar. Chưa đọc có nền đậm, chấm trạng thái và tiêu đề đậm. Trạng thái đã đọc được lưu theo tài khoản trên từng thiết bị, không cần migration và không ghi Google Sheet. Fingerprint gồm ID + nội dung nghiệp vụ nên cảnh báo thay đổi sẽ trở thành chưa đọc.
- API trung tâm hợp nhất năm nhóm đã duyệt: đối soát/thưởng, số dư Quỹ dưới ngưỡng, chấm công/phân công cần kiểm tra, sync/write queue lỗi và tổng hợp cuối ngày. Cảnh báo hệ thống chỉ hiện/gửi cho admin; operator nhận nghiệp vụ Vận hành; shareholder giữ quyền xem đối soát cũ và nhận cảnh báo Quỹ.
- Delivery Web Push gom sự kiện mới theo nhóm để chống nhiễu, tạo baseline lần đầu để không bắn lại cảnh báo cũ, gửi daily digest lúc 20:00 Việt Nam và cập nhật PWA badge qua `unreadCount`/`badgeCount`. Preference mở rộng lưu server-only trong `notification_rule_states`, không cần migration mới; fund preference tiếp tục dùng bảng hiện hành.
- Apps Script dispatch có feature gate `NOTIFICATION_DISPATCH_ENABLED`; Production đã bật sau khi Vercel endpoint cut-forward và ba Script Properties `NOTIFICATION_DISPATCH_ENABLED`, `NOTIFICATION_DISPATCH_URL`, `NOTIFICATION_DISPATCH_SECRET` được cấu hình đồng bộ với Production. Preview tiếp tục không phát delivery thật.
- Authenticated Preview có 28 cảnh báo thực tế. QA PASS ở 390x844 và 1440x900: đọc một mục làm số chưa đọc và badge giảm 28→27; `Chưa đọc` hiển thị đúng 27 mục; `Xem tất cả` hiển thị 28 mục gồm 1 đã đọc; nền/chấm/trọng lượng chữ đổi đúng trạng thái, panel không tràn viewport, không còn text nguồn và không có console warning/error.
- Toàn bộ `select.platform-content-select` giữ 40px gutter cho chevron, text căn trái và không dùng `field-sizing` làm mất phần đệm. Danh mục chỉ render bộ lọc phù hợp với tab; search, filter và icon Nhập mới đều 44px, cùng một hàng tại 390px và 1440px. Audit Vận hành, Quỹ và Báo cáo xác nhận select visible đều có `padding-right: 40px`, text trái và trang không tràn ngang.
- Gate cuối trước cut-forward PASS 490/490 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Apps Script Production đã cập nhật cùng deployment ID canonical lên `@328`; Vercel Production là `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q`.
- Authenticated Preview QA PASS: trung tâm hợp nhất 30 cảnh báo active, trong đó có cảnh báo chấm công lấy đúng helper workbook và lỗi refresh queue lấy từ `sync_status`; 5 preference hiển thị đúng ở Cài đặt, không có runtime log warning/error. Delivery gate vẫn tắt nên không phát Web Push thật.
- Cấu hình rule số dư Quỹ của admin đã được gộp ngay dưới preference `Cảnh báo số dư Quỹ` theo progressive disclosure; công tắc nhận thông báo theo tài khoản và công tắc rule tự động toàn hệ thống vẫn tách nghĩa rõ ràng, không đổi API/nghiệp vụ.
- Date-control contract cuối cùng áp dụng cho text overlay và native `input[type=date|month]`, gồm pseudo-element Safari; mobile 390x844 hiển thị đủ hai ngày cùng hàng, căn trái và `Tháng này` không ellipsis, desktop 1440x900 dùng native date có pointer interaction và căn trái. QA trực quan chuông, settings và Quỹ PASS trên Preview `dpl_HHEGzBLGvZn3cz8EnBrySzYduTVh`.
- Lần gọi dispatcher Production đầu tiên chỉ tạo baseline 30 mục, `sent=0`, nên không phát lại cảnh báo cũ. Các chu kỳ sau chỉ gửi sự kiện mới và daily digest theo contract.
- Public Production smoke PASS cho root, Dashboard, Báo cáo, Vận hành, Danh mục, Quỹ, Cài đặt, manifest và service worker; session không cookie và dispatcher không bearer đều trả 401; health trả 200 với đúng app/Supabase/Vercel project/Apps Script Production. Không có request 5xx trong cửa sổ cut-forward. Authenticated Production smoke chưa chạy vì phiên đăng nhập Preview không dùng chung cookie với domain Production.
- Rollback READY: Vercel `dpl_A4CfP4ThTzsvwHTQ5wVm3whwDUCG`; Apps Script `@325` trên cùng deployment ID canonical. Có thể ngắt delivery ngay bằng `NOTIFICATION_DISPATCH_ENABLED=false` nếu cần cô lập riêng kênh thông báo.

### Auth hydration và filter-control contract — Preview hoàn thành 2026-08-12

- Nhánh chưa xác thực trong root layout không còn render một `C2Document` thứ hai bên trong document gốc. Cấu trúc Preview chỉ có một `html`/`body`, loại repaint/hydration không cần thiết khi chuyển từ loading sang LoginGate hoặc app.
- Danh mục bỏ nhãn `Tìm kiếm` khỏi giao diện nhưng giữ tên truy cập qua visually-hidden/`aria-label`; icon `Nhập mới` 44px nằm cùng hàng với ô tìm kiếm trên mobile 390px và desktop 1440px. Bộ lọc trạng thái/chủ xe nằm ở hàng phụ khi thiếu không gian.
- Tất cả `select.platform-content-select` dùng cùng contract: text căn trái, font-weight 500, một chevron xuống ở mép phải; không quay lại native up/down indicator. Vận hành và Quỹ đã authenticated QA tại 390px; Danh mục đã QA tại 390px và 1440px.
- Authenticated reload QA lấy mẫu mỗi 100ms: loading hiển thị đến khoảng 770ms rồi chuyển thẳng sang app từ khoảng 928ms; 12/12 mẫu không xuất hiện LoginGate. Đây là xác nhận reload với phiên sẵn có; không chủ động đăng xuất/xác thực lại để tránh làm mất phiên người dùng.
- Full deploy gate PASS 482/482 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_Ed3bseChDUbmwtwrwv4uziBtiae8`; Production giữ nguyên `dpl_A4CfP4ThTzsvwHTQ5wVm3whwDUCG` và Apps Script `@325`.
- Checkpoint tiếp theo: chờ người dùng duyệt trực quan Preview; chỉ promote Production khi có phê duyệt riêng.

### Live dropdown semantics và session stability — Production hoàn thành 2026-08-12

- Đã audit read-only hai workbook canonical theo từng sheet/cột và đối chiếu validation vật lý, helper list, header cùng dữ liệu thực. Dropdown được ánh xạ theo ngữ nghĩa trường thay vì suy luận chung từ chữ `Dự án`.
- `NL_TaiXe.Nhóm vận hành` nay là trường chọn bắt buộc và lấy đúng `SYS_DanhSach!DS_NhomVanHanh`: `Tràng Duệ`, `Amata`, `Dự án nhỏ`; không còn tự suy ra từ phân công xe hoặc hiển thị dự án đơn lẻ. `NL_NghiVanHanh.Dự án` cũng dùng nhóm vận hành theo dữ liệu live, còn `NL_VanChuyen.Dự án` tiếp tục dùng danh sách dự án đơn lẻ.
- Catalog editor dùng mapping sheet-aware cho các tham chiếu dự án, nhóm vận hành, xe, nhân sự và cờ Có/Không; các trường định danh chính của từng danh mục không bị biến thành dropdown tự tham chiếu.
- Module Quỹ đã đồng bộ `HINHTHUC`, mở rộng đúng phạm vi `MUCTHU`/`MUCCHI`, yêu cầu hình thức cho thu/chi/vay/trả và giữ đúng loại thanh toán `Vay`, `Trả nợ`, `Trả lãi` (không phát sinh `Trả gốc`).
- Đã chạy thành công ba tác vụ cache `syncAllStartupAndCatalogsToSupabase`, `syncAllFundBundlesToSupabase`, `syncAllFundCatalogsToSupabase`. Apps Script Preview `@325` health HTTP 200; OAuth được cấp lại để khôi phục health của cả hai deployment nhưng không thay đổi code/deployment Production.
- Authenticated Preview QA xác nhận: `NL_VanChuyen` có dự án đơn lẻ; `NL_TaiXe` và `NL_NghiVanHanh` chỉ có ba nhóm `Tràng Duệ`, `Amata`, `Dự án nhỏ`; form Quỹ có đúng `HINHTHUC`, mục chi `Trả nợ`/`Trả lãi`, không có `Trả gốc`; không ghi dữ liệu nghiệp vụ và không có console warning/error.
- `SessionKeepAlive` không còn gọi lại `/api/session` ngay sau khi server vừa xác thực. Việc kiểm tra vẫn chạy mỗi 40 phút hoặc khi quay lại tab sau 40 phút, loại vòng app → khôi phục đăng nhập → app do lần xác thực client trùng. Ba lần reload authenticated liên tiếp trên Preview đều giữ app ổn định, không hiện LoginGate.
- Full deploy gate PASS 481/481 tests, ESLint, typecheck, Next build, Environment Identity Guard và `git diff --check`. Preview Vercel `dpl_Gvy4VJJswccvxyzRFA3J4g1ntJaP`; Production Vercel `dpl_A4CfP4ThTzsvwHTQ5wVm3whwDUCG` và Apps Script `@325`.
- Post-cutover public Production smoke PASS cho root, Dashboard, Báo cáo, Vận hành, Danh mục, Quỹ, Cài đặt, manifest và service worker; session không cookie trả 401; health đúng app/Supabase/Vercel Production/Apps Script Production. Không có request 5xx trong log cửa sổ cutover. Phiên Preview đã authenticated QA; Production còn chờ người dùng đăng nhập vì cookie không dùng chung domain.
- Rollback READY: Vercel `dpl_9jD9FkXuUUSTv9MmUTZCV3JGSHde`, Apps Script `@322` trên cùng deployment ID Production.

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

**Ưu tiên hiện tại:** checkpoint retry/chống cảnh báo giả đã hoàn thành trên Production. Theo dõi các lượt chạy tự nhiên để xác nhận hành vi retry/hysteresis trong điều kiện thực tế; không chủ động gây lỗi Supabase hoặc phát push thử trên Production.

1. **Theo dõi độ bền pipeline Production**: ở lần lỗi mạng tự nhiên tiếp theo, xác nhận lỗi đơn lẻ tự retry và chỉ cảnh báo sau 3 tick thất bại liên tiếp; khi hồi phục không còn cảnh báo stale/raw kỹ thuật.
2. **Theo dõi lần ghi khoản vay tự nhiên tiếp theo**: xác nhận khoản vay mới không còn lỗi `Hình thức`, không tạo bản ghi thử hoặc bản ghi trùng chỉ để test Production.
3. **Theo dõi trigger Thu Chi thực tế**: ở lần người dùng sửa trực tiếp `NHAP_THUCHI`/`NHAP_VAY` tiếp theo, xác nhận `fund_manual_sheet` và bundle tháng liên quan có timestamp mới; không tạo giao dịch giả chỉ để test Production.
4. **Thay GitHub schedule khỏi SLA 5 phút**: 99/99 khoảng chạy đã quan sát trễ hơn 10 phút, 12 khoảng hơn một giờ và cực đại 588 phút. Chọn scheduler có delivery/retry phù hợp trong checkpoint hạ tầng riêng; GitHub Actions chỉ là best-effort, không được mô tả là watchdog 5 phút bảo đảm.
5. **Theo dõi lượt tổng hợp Production đầu tiên**: xác nhận notification đầu tiên sau 12:00 dùng đúng số liệu D−1; không phát thử thủ công để tránh tạo notification ngoài lịch.
6. **Duyệt notification copy trên thiết bị thật**: kiểm tra nhấn giữ sao chép trên Safari/iOS và xác nhận danh sách không còn lỗi sync cũ.
7. **Unread đa thiết bị**: read-state hiện vẫn theo tài khoản trên từng thiết bị. Chỉ tạo migration riêng nếu cần đồng bộ đã đọc giữa nhiều thiết bị.

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
2. Authenticated Preview và tài khoản admin trên Production đã PASS các luồng chính gần nhất; operator/shareholder vẫn chưa có representative production smoke đầy đủ.
3. Authenticated visual/device QA không thể được thay thế hoàn toàn bằng unit/HTTP/DOM test.
4. Apps Script public deployment đã trở lại HTTP 200 sau khi đúng owner `ngotuong077@gmail.com` cấp lại quyền; tài khoản clasp `vipmoschino@gmail.com` vẫn không có Execution API permission và không được dùng để suy luận runtime owner. Watchdog phải phân biệt `deployment_access_denied` với OAuth thật và không thể tự chữa khi Google chặn trước khi code chạy. GitHub schedule đã chứng minh không đạt SLA 5 phút. Health trực tiếp, heartbeat, scheduler run và identity fingerprint phải được kiểm tra sau deploy.
5. Identity Guard chỉ yêu cầu `.clasp.json` trong local workspace; Vercel build không có file Git-ignored này và phải dựa vào canonical manifest + runtime environment checks.
6. Client từng cài service worker legacy cần theo dõi riêng; service worker hiện tại không cache app/data.
7. iOS Web Push chỉ hoạt động với app Add to Home Screen và quyền được cấp từ thao tác người dùng.
8. Mọi thay đổi Google Sheet/Supabase schema phải có migration riêng; migration `001–013` đã chạy là bất biến, correction tiếp theo dùng `014+`.
9. Không đổi tên sheet, thứ tự cột, công thức hoặc helper range. Xóa Vận hành là clear-only.
10. Report parity phải dùng exact `source_data_version`, loại field volatile khỏi hash và kiểm tra đủ các tháng hiện hành cùng `Tất cả`.
11. Manual edit workbook Thu chi đã có direct edit/change trigger và bounded polling fallback, nhưng vẫn là eventual consistency và phụ thuộc trigger owner/quota. Queue coordinator bắt buộc chỉ claim một scope mỗi tick; regression hai queue cùng đến hạn đã được khóa. Phần lan truyền qua `IMPORTRANGE` sang báo cáo Vận tải vẫn có độ trễ công thức riêng.
12. Rollback Apps Script dùng version còn lưu trên cùng production deployment ID; không dùng recovery deployment `@281` đã undeploy.
13. Production warning `DEP0169 url.parse()` có thể xuất hiện trên request HTTP 200; chưa có call site trực tiếp trong source.
14. Live parity đã PASS copy-canary, full gate, authenticated Preview và authenticated admin Production. Operator/shareholder representative smoke vẫn còn thiếu; không dùng `INPHIEU` làm tiêu chí parity vì người dùng đã loại chức năng này.

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
