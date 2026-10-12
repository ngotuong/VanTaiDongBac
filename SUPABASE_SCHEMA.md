# SUPABASE_SCHEMA

## Phạm vi hiện tại

Supabase hiện cung cấp Auth, read model/cache, write queue, sync status và notification state cho nhiều module. Google Sheets vẫn là nguồn dữ liệu chuẩn; Supabase không phải source of truth nghiệp vụ.

Migration live và gate do [PROJECT_CONTEXT](PROJECT_CONTEXT.md) sở hữu. Migration đã chạy là bất biến; correction phải dùng phiên bản tiếp theo.

Nguồn Google Sheet:

- `BC_TongQuan`
- `BC_BangLuong`
- `BC_TongHopXe`

Next Report đọc qua server boundary trong `next-shell/lib/report-server.ts`. Runtime report là Supabase-only cache; Apps Script live-compute từ Google Sheets và upsert lại bundle khi cache miss/lỗi hoặc force refresh.

## Bảng `public.report_bundles`

| Cột | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `spreadsheet_id` | `text` | Có | ID file Google Sheet vận tải theo năm. |
| `report_month` | `text` | Có | Tháng báo cáo, ví dụ `1`, `2`, `Tất cả`, hoặc tháng được frontend chọn. |
| `source_sheet_names` | `text[]` | Có | Danh sách sheet nguồn đã dùng để tạo payload. |
| `payload` | `jsonb` | Có | Dữ liệu trả về từ `ReportService.getReportBundle(month, true)`. |
| `cache_version` | `text` | Không | Version schema cache chi tiết do Apps Script ghi, ví dụ `v13`. Được thêm ở migration `010`. |
| `source_data_version` | `text` | Không | Version dữ liệu Google Sheet dùng để tạo bundle. Được thêm ở migration `010`. |
| `details_hash` | `text` | Không | SHA-256 chữ thường của `overview.details` đã chuẩn hóa để đối soát. Được thêm ở migration `010`. |
| `synced_at` | `timestamptz` | Có | Thời điểm Apps Script sync sang Supabase. |
| `created_at` | `timestamptz` | Có | Thời điểm tạo row. |
| `updated_at` | `timestamptz` | Có | Thời điểm cập nhật row gần nhất. |

Khóa chính:

- `(spreadsheet_id, report_month)`

Quan hệ:

- Chưa tạo quan hệ ở giai đoạn 1.
- Bảng này là cache độc lập, không thay thế cấu trúc Google Sheet.

RLS:

- Bật Row Level Security.
- Migration `008` thu hồi quyền `anon`; `authenticated` chỉ SELECT khi `is_active_app_user()`. Runtime browser dùng API có session/RBAC; Next server dùng service role.
- Không cấp quyền ghi cho frontend.
- Apps Script dùng service role key để upsert dữ liệu.

Migration `010_report_cache_cutover_foundation.sql` không tạo bảng cache thứ hai. Nó giữ nguyên khóa chính trên để mỗi workbook/tháng chỉ có một row JSON, đồng thời thêm metadata cần cho dual-run và parity. Các row cũ được giữ nguyên; ba cột mới nullable cho đến khi E1.2 bắt đầu ghi metadata.

## Luồng đồng bộ

1. Web app ghi qua API/queue/journal; chỉnh Sheet phát invalidation qua trigger. Google Sheets/công thức vẫn là nguồn chuẩn, đọc bằng `openById`.
2. Worker Transport/Fund xử lý stage/cursor theo [cache/queue contract](docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md), rồi upsert cache bằng service role. Scope thường và full refresh đều có ACK; các helper bulk thủ công không mô tả lịch chạy priority hiện tại.
3. Browser gọi same-origin API; Next server đọc cache. Cache miss/lỗi hoặc force refresh đi qua server tới Apps Script live compute + upsert; không đọc bằng anon key trong browser.
4. Report và payroll-v6 cần exact `source_data_version` cùng tháng. Các report stage có version riêng; không giả định cả lượt refresh tháng khác nhau dùng một version chung.

## File liên quan

- SQL migration: `supabase/migrations/001_report_bundles.sql`
- SQL migration realtime cache: `supabase/migrations/002_realtime_cache.sql`
- Apps Script sync: `SupabaseService.gs`
- Report cache adapter: `SupabaseReportCacheRepository.gs`
- API expose thủ công: `PublicApi.gs`, `Router.gs`
- Next API clients: `next-shell/lib/platform/`
- Report server boundary: `next-shell/lib/report-server.ts`

## Bảng cache giai đoạn 2

### `public.fund_overview_bundles`

Cache dữ liệu `FundService.getFundOverview(year, { month })`.

Khóa chính:

- `(year, month_key)`

### `public.fund_transaction_bundles`

Cache dữ liệu `FundService.getFundTransactions(year, filter)`.

Khóa chính:

- `(year, filter_key)`

Filter đang dùng cho menu giao dịch Quỹ:

- `recent_500`
- `month:YYYY-MM`, ví dụ `month:2026-07`

Frontend đọc:

- Nếu không chọn đủ khoảng ngày, menu Giao dịch Quỹ đọc `recent_500`.
- Nếu chọn đủ khoảng ngày, frontend đọc các cache `month:YYYY-MM` tương ứng rồi ghép, lọc ngày và lọc tìm kiếm ngay trên trình duyệt.
- Nếu cache thiếu/lỗi hoặc bấm làm mới, frontend fallback về Apps Script `getFundTransactions`.

### `public.fund_loan_bundles`

Cache dữ liệu `FundService.getFundLoanOverview(year, { month })`.

Khóa chính:

- `(year, month_key)`

### `public.sync_status`

Ghi trạng thái sync gần nhất theo `sync_key`, gồm module, status, message và thời điểm sync.

Frontend không đọc bảng này trực tiếp. Apps Script expose action `getSupabaseSyncStatus` và dùng service role key để đọc tối đa các dòng mới nhất; màn hình `Cài đặt > Trạng thái đồng bộ` hiển thị `sync_key`, module, status, message và tuổi cache. Panel này dùng để quan sát độ tươi cache trước khi mở rộng realtime notification.

RLS của các bảng giai đoạn 2:

- Quyền hiện hành theo migration `008`/`015` và mục allowlist dưới đây; `anon` không được đọc. Read model còn policy active-user SELECT; `catalog_bundles`/`sync_status` là service-only.
- Runtime browser dùng API có session/RBAC; Apps Script/Next server dùng service role.

## Bảng cache giai đoạn 3

### `public.startup_bundles`

Cache dữ liệu màn hình khởi động từ `SheetService.getStartupData(formType)`.

| Cột | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| `form_type` | `text` | Có | Khóa chính. Hiện dùng chính là `vanChuyen`. |
| `payload` | `jsonb` | Có | Dữ liệu startup gồm bootstrap, danh mục form đầu, dashboard nhẹ và links. |
| `synced_at` | `timestamptz` | Có | Thời điểm Apps Script sync sang Supabase. |
| `created_at` | `timestamptz` | Có | Thời điểm tạo row. |
| `updated_at` | `timestamptz` | Có | Thời điểm cập nhật row gần nhất. |

Nguồn Google Sheet tương ứng:

- Các sheet danh mục mà `getCatalogs('vanChuyen')` đang đọc.
- Các sheet báo cáo nhẹ dùng cho dashboard khởi động, ví dụ `BC_TongQuan`.

Frontend đọc:

- Next module server loaders ưu tiên bundle/cache phù hợp trước khi fallback Apps Script.
- Nếu thiếu cache/lỗi, frontend fallback về Apps Script `getStartupData`.

### `public.catalog_bundles`

Cache dữ liệu danh mục dùng cho nhập liệu và màn hình Danh mục.

| Cột | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| `catalog_key` | `text` | Có | Khóa chính. Ví dụ `catalogs:vanChuyen`, `catalogs:all`, `catalog_data:DM_Xe`. |
| `payload` | `jsonb` | Có | Dữ liệu trả về từ `CatalogService.getCatalogs` hoặc `CatalogService.readCatalogData`. |
| `synced_at` | `timestamptz` | Có | Thời điểm Apps Script sync sang Supabase. |
| `created_at` | `timestamptz` | Có | Thời điểm tạo row. |
| `updated_at` | `timestamptz` | Có | Thời điểm cập nhật row gần nhất. |

Nguồn Google Sheet tương ứng:

- `DM_NhanSu`
- `DM_Xe`
- `DM_DuAn`
- `DM_LuongChuyen`
- `DM_ThamSo`
- `DM_DonGiaVanChuyen`
- `DM_ThuongQuanLy`
- `DM_PhatNoiBo`
- File Thu chi 2026: `CAIDAT`, `NHAP_THUCHI`, `NHAP_VAY` cho cache danh mục nhập Quỹ.

Frontend đọc:

- `next-shell/lib/entry-server.ts` tải danh mục nhập liệu.
- `next-shell/lib/catalog-server.ts` tải bảng Danh mục.
- `next-shell/lib/cashflow-server.ts` tải form options/danh mục Quỹ bằng key theo year/group.
- `fund_catalog:YYYY:group` chỉ chứa danh mục cấu hình từ `CAIDAT`/catalog sheet, không trộn các giá trị fallback quét từ giao dịch đã nhập.
- `fund_loan_bundles` nhận payload từ `FundService.getFundLoanOverview`; khi đọc `NHAP_VAY`, backend chuẩn hóa các biến thể loại dòng trả gốc thành `Trả nợ` để KPI `Đã trả nợ gốc` và `Dư nợ` nhất quán.
- Nếu cache thiếu/lỗi, frontend fallback về Apps Script `getCatalogs` hoặc `readCatalogData`.

Luồng đồng bộ:

1. Google Sheet vẫn là nguồn chuẩn.
2. Apps Script chạy `syncAllStartupAndCatalogsToSupabase()` khi backfill, hoặc trigger tick `syncRealtimeCache()` đồng bộ luân phiên.
3. Apps Script upsert vào `startup_bundles` và `catalog_bundles` bằng service role key.
4. Next server đọc qua service role; browser gọi same-origin API có session/RBAC.
5. Khi sửa/xóa danh mục qua web app, Apps Script ghi Google Sheet trước rồi sync lại cache liên quan.

RLS:

- `startup_bundles` giữ active-user SELECT theo `008`; `catalog_bundles` chỉ service role theo `015`; `anon` không được đọc.
- Runtime browser dùng API có session/RBAC; Apps Script/Next server dùng service role.

## Bảng cache giai đoạn 4

### `public.manage_data_bundles`

Cache dữ liệu đọc danh sách mặc định của menu **Vận hành**.

| Cột | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| `sheet_name` | `text` | Có | Tên sheet vận hành, ví dụ `NL_VanChuyen`, `NL_TaiXe`. |
| `filter_key` | `text` | Có | `recent_500` cho dữ liệu gần nhất, hoặc `month:YYYY-MM` cho cache theo tháng. |
| `payload` | `jsonb` | Có | Dữ liệu trả về từ `ManageService.readManageData`. |
| `synced_at` | `timestamptz` | Có | Thời điểm Apps Script sync sang Supabase. |
| `created_at` | `timestamptz` | Có | Thời điểm tạo row. |
| `updated_at` | `timestamptz` | Có | Thời điểm cập nhật row gần nhất. |

Khóa chính:

- `(sheet_name, filter_key)`

Nguồn Google Sheet tương ứng:

- `NL_VanChuyen`
- `NL_TaiXe`
- `NL_Dau`
- `NL_ChamCong`
- `NL_Phat`
- `NL_NghiVanHanh`

Frontend đọc:

- `next-shell/lib/manage-server.ts` đọc `recent_500` khi người dùng vào Vận hành ở trạng thái mặc định.
- Khi chọn đủ khoảng ngày, frontend đọc các cache `month:YYYY-MM` tương ứng rồi ghép và lọc ngay trên trình duyệt.
- Nếu bấm làm mới, cache thiếu hoặc Supabase lỗi, frontend fallback về Apps Script `readManageData`.

Luồng đồng bộ:

1. Google Sheet vẫn là nguồn chuẩn.
2. Apps Script chạy `syncAllManageDataToSupabase()` khi backfill, hoặc trigger tick `syncRealtimeCache()` đồng bộ lần lượt từng sheet gần đây.
3. Apps Script upsert `recent_500` và union tháng nguồn/cached keys; tháng mất dòng cuối cũng được publish cache rỗng.
4. Web app ghi Sheet qua queue/journal rồi refresh các scope liên quan; trigger Sheet chỉ enqueue. Stage/cursor/verification theo cache/queue contract.

RLS:

- `anon` không được đọc; `authenticated` chỉ SELECT khi active theo `008`.
- Runtime browser dùng API có session/RBAC; Apps Script/Next server dùng service role.

## Thông báo in-app đối soát chuyến

Không đọc trực tiếp `XL_DoiSoatChuyen` mỗi lần mở app vì sẽ chậm.

Luồng đúng cho thông báo:

1. Google Sheet vẫn tính đối soát/thưởng nóng trong `XL_DoiSoatChuyen`.
2. Apps Script trigger đọc sheet này theo chu kỳ 1-5 phút.
3. `TripNotificationSyncService` ghi một bundle nhỏ vào `manage_data_bundles` với `sheet_name=XL_DoiSoatChuyen`, `filter_key=notifications:active`; bundle chứa tối đa 100 cảnh báo của 45 ngày gần nhất.
4. Frontend gọi proxy-local `getNotifications`; API xác thực session/RBAC và chỉ đọc Supabase, không gọi Apps Script khi mở chuông.
5. `OperationalNotificationSyncService` ghi bundle `SYSTEM_NOTIFICATIONS/operations:active` từ đúng hai helper công thức `NL_ChamCong.Lưu ý` và `NL_PhanCongLai.Kiểm tra`.
6. API hợp nhất thêm số dư Quỹ, `sync_status` và `write_jobs`; không gọi Apps Script khi mở chuông.
7. Web Push delivery dùng `notification_rule_states` cho baseline/idempotency và preference mở rộng. Read-state của panel vẫn lưu theo tài khoản trên từng thiết bị; đồng bộ read-state đa thiết bị cần migration riêng.

## Bảng ghi bất đồng bộ giai đoạn 5

### `public.write_jobs`

Queue ghi dữ liệu từ web app về Google Sheet. Frontend không chờ Google Sheet ghi xong; Apps Script enqueue job vào Supabase rồi worker trigger xử lý sau.

Trạng thái:

- `pending`: đã nhận lệnh, chờ worker.
- `processing`: worker đang ghi Google Sheet.
- `synced`: đã ghi Google Sheet thành công.
- `failed`: ghi thất bại quá số lần thử.

Các cột chính:

- `id`: mã job do Apps Script sinh.
- `module`: module nghiệp vụ, v1 dùng `transport`.
- `action`: hành động cần xử lý, v1 dùng `submitRows`.
- `payload`: dữ liệu cần ghi.
- `result`: kết quả ghi Google Sheet khi thành công.
- `attempts`, `max_attempts`, `last_error`, `next_run_at`, `locked_at`, `synced_at`.

### `public.write_job_logs`

Log từng lần xử lý job, dùng để debug lỗi và làm nền cho retry/notification sau này. `id` dùng bigserial `write_job_logs_id_seq`: migration 018 khai báo service-only USAGE, thu hồi mọi quyền sequence của public/anon/authenticated và SELECT/UPDATE của service_role. Quyền table không tự cấp quyền sequence trên database mới. Không dùng setval/nextval bằng browser.

Frontend hiện poll trạng thái qua Apps Script action `getWriteJobStatus`. Retry thủ công dùng `retryWriteJob(jobId)`. Worker Apps Script chạy `processWriteJobs()` bằng trigger 1 phút, cài bằng `installWriteJobTrigger()`.

Write queue v2 hiện hỗ trợ `transport/submitRows`, `transport/saveSheetRow` và queued delete chỉ khi xóa nội dung cột:

- `ASYNC_TRANSPORT_WRITE_ENABLED=true` cho nhập mới/sửa Vận hành.
- `ASYNC_WRITE_ENABLED=false` vẫn giữ để không bật lại các luồng async v1 đại trà.
- POST `submitRows`/`saveSheetRow` tạo job `pending`; xóa nguyên dòng không vào queue để tránh retry xóa nhầm dòng kế tiếp.
- Worker ghi Google Sheet bằng `EntryService.submitRows()`, sau đó sync nhanh cache Vận hành liên quan.
- Action `getRecentWriteJobs` cho phép frontend khôi phục job gần đây sau khi reload, dùng để hiển thị lại pending/synced tạm thời trong bảng Vận hành và Tổng quan.

Migration `006_write_queue_hardening.sql` bổ sung `idempotency_key`, `worker_id`, `claimed_at` và RPC `claim_write_jobs()`. RPC claim atomically bằng `FOR UPDATE SKIP LOCKED`; runtime R1 dùng stale window 15 phút và terminal update có điều kiện theo owner worker. Append Vận hành giữ `jobId` trong Developer Metadata của vùng Sheet để retry không append dòng mới; khoản vay Quỹ dùng note `VTDB_JOB:<jobId>` ở cột mã vay.

Pilot Quỹ dùng `module=fund`, `action=addFundTransactions`. Voucher được sinh trước và lưu trong payload; worker kiểm tra toàn bộ voucher trước khi append. Flag `ASYNC_FUND_TRANSACTION_ADD_ENABLED` đọc từ Script Properties, mặc định false trong code và đã bật true trên production ngày 2026-07-10. Pending Quỹ không được cộng vào KPI trước khi job `synced`.

### `public.app_users`

Allowlist cho Supabase Auth nội bộ, gồm `user_id`, `username`, email kỹ thuật, `role`, `active`, `display_name`, `created_at`, `updated_at`. Giao diện đăng nhập bằng username/password; frontend chuyển username thành địa chỉ kỹ thuật `username@dongbac.internal`, không yêu cầu email thật. Migration `007_auth_hardening.sql` tạo allowlist; migration `008_authenticated_read_cutover.sql` thu hồi quyền `anon`; migration `009_shareholder_role.sql` thêm role `shareholder`.

Role ứng dụng:

- `admin`: toàn quyền nghiệp vụ và quản lý tài khoản.
- `operator`: đọc/ghi nghiệp vụ, không quản lý tài khoản.
- `shareholder`: chỉ đọc báo cáo, bảng Vận hành, giao dịch Thu chi và khoản vay. Proxy từ chối action ghi bằng HTTP 403.

RLS cho phép user `authenticated` đang active đọc business read-model cần thiết; ghi cache/queue vẫn chỉ dùng service role. Sau khi apply `015`, `catalog_bundles`, `sync_status`, `write_jobs` và `write_job_logs` chỉ còn service role, browser đi qua proxy. Phân quyền action chi tiết được thực thi tại Vercel API proxy.

### `public.web_push_subscriptions`

Subscription Web Push theo từng tài khoản và thiết bị, được tạo bởi migration `011_web_push_subscriptions.sql`.

Các cột chính:

- `id`: UUID của subscription;
- `user_id`: tham chiếu `app_users.user_id`, tự xóa khi app user bị xóa;
- `endpoint_hash`: SHA-256 của endpoint, dùng làm khóa tìm kiếm không lộ endpoint trong query;
- `endpoint`, `p256dh`, `auth_secret`: credential Web Push của thiết bị;
- `user_agent`: mô tả trình duyệt đã rút gọn;
- `created_at`, `updated_at`, `last_seen_at`: vòng đời subscription.

Khóa unique là `(user_id, endpoint_hash)`. Bảng bật RLS nhưng thu hồi toàn bộ quyền của `anon` và `authenticated`; chỉ Vercel server dùng `service_role` được đọc/ghi. Browser thao tác qua `/api/push`, không đọc Supabase trực tiếp. Subscription không chứa dữ liệu nghiệp vụ và checkpoint Web Push đầu tiên không cache HTML/API hoặc dữ liệu offline.

### `public.notification_rule_states`

Trạng thái server-only của các rule thông báo theo lịch, tạo bởi migration `012_notification_rule_states.sql`. Rule đầu tiên có khóa `fund-current-balance-below-10m` và lưu trạng thái đang dưới ngưỡng, giá trị/threshold gần nhất, `last_evaluated_at`, `last_sent_at` cùng kết quả lần chạy.

Bảng bật RLS, thu hồi toàn bộ quyền `anon`/`authenticated` và chỉ cho `service_role` đọc/ghi. Đây không phải nguồn số dư; số dư vẫn lấy từ metric `currentBalance` của `fund_overview_bundles`, cùng dữ liệu card “Số dư hiện tại”.

### Notification preferences và rule config (`013`)

- `notification_preferences`: lựa chọn loại thông báo theo `(user_id, notification_key)`; loại đầu tiên là `fund-low-balance`. Admin/Cổ đông thiếu row được hiểu là bật để giữ default nghiệp vụ, còn lựa chọn tắt được lưu rõ ràng.
- `notification_rule_configs`: cấu hình admin-editable của rule Quỹ gồm trạng thái sẵn sàng, ngưỡng, cooldown, nhóm nhận và nội dung. `schedule_time` bị constraint ở `08:00`; scheduler vẫn do deployment quản lý.
- `notification_rule_audit_logs`: trigger ghi `previous_config`/`next_config` và người thay đổi cho mỗi lần admin lưu.

Cả ba bảng bật RLS, revoke `public`/`anon`/`authenticated` và chỉ cấp quyền cho `service_role`. Browser chỉ đi qua API same-origin có session/RBAC.

### Payroll explanation bundles (`014`; atomic replace ở `015`, đã apply)

`payroll_explanation_bundles` lưu bằng chứng giải trình theo khóa `(spreadsheet_id, report_month, employee_key)`. Payload đối chiếu `BC_BangLuong` với `XL_LuongNhanSu`, chi tiết `XL_LuongTheoXe` và nghỉ phép chính thức từ `NL_ChamCong`; không tự tính lại hoặc ghi ngược lương.

Bảng là server-only: bật RLS, không tạo policy đọc, revoke `public`/`anon`/`authenticated` và chỉ grant `service_role`. API chỉ đọc `is_current=true`. Migration `015` thêm RPC service-role `replace_payroll_explanation_month`, thực hiện stale + upsert trong cùng transaction và từ chối row lệch workbook/tháng. Browser chỉ gọi proxy-local `getPayrollExplanation`, dành cho `admin`/`operator` và không nhận Spreadsheet ID từ client.

### Payroll v6 cache isolation (`017`)

`payroll_explanation_bundles_v6` giữ cùng schema/key với cache legacy nhưng có bảng/RPC riêng `replace_payroll_explanation_month_v6`. RLS bật, không policy browser, chỉ service_role. RPC kiểm tra workbook/tháng và payload `payroll-explanation-v6`, thay tháng atomically. Không sửa/invalidate bảng/RPC v5; hai runtime có thể refresh riêng trong cửa sổ Preview/Production. Source of truth vẫn là Sheets. Trạng thái apply do context sở hữu.
