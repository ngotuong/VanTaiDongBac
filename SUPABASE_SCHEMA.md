# Supabase schema giai đoạn 1

## Phạm vi thử nghiệm

Giai đoạn 1 chỉ dùng Supabase làm database/cache cho màn hình **Báo cáo**. Google Sheet vẫn là nguồn dữ liệu chuẩn. Apps Script vẫn đọc Google Sheet, gom dữ liệu báo cáo thành một payload JSON, rồi ghi một chiều sang Supabase.

Màn hình chọn thử nghiệm: `Báo cáo`

Nguồn Google Sheet:

- `BC_TongQuan`
- `BC_BangLuong`
- `BC_TongHopXe`

Next Report đọc qua server boundary trong `next-shell/lib/report-server.ts`. Nếu Supabase chưa cấu hình, chưa có dữ liệu hoặc lỗi, Vercel service fallback Apps Script action `getReportBundle`.

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
- Cho phép `anon` và `authenticated` chỉ `select`.
- Không cấp quyền ghi cho frontend.
- Apps Script dùng service role key để upsert dữ liệu.

Migration `010_report_cache_cutover_foundation.sql` không tạo bảng cache thứ hai. Nó giữ nguyên khóa chính trên để mỗi workbook/tháng chỉ có một row JSON, đồng thời thêm metadata cần cho dual-run và parity. Các row cũ được giữ nguyên; ba cột mới nullable cho đến khi E1.2 bắt đầu ghi metadata.

## Luồng đồng bộ

1. Người dùng nhập/sửa dữ liệu như cũ trong web app hoặc Google Sheet.
2. Công thức trong Google Sheet tính các sheet báo cáo như cũ.
3. Chạy thủ công Apps Script function `testSupabaseReportSync()` hoặc `syncReportBundleToSupabase(month)`.
4. Apps Script đọc Google Sheet bằng `SpreadsheetApp.openById(APP_CONFIG.spreadsheetId)`.
5. Apps Script gọi Supabase REST API bằng `SUPABASE_SERVICE_ROLE_KEY` trong Script Properties.
6. Supabase lưu một row trong `report_bundles`.
7. Frontend Vercel đọc `report_bundles.payload` bằng anon key.
8. Nếu đọc Supabase lỗi, frontend tự gọi Apps Script `getReportBundle` như trước.

Từ E1.2, Apps Script cũng có thể đọc `payload.overview.details` theo đúng `cache_version` và `source_data_version`. Khi sync toàn bộ, backend tạo một `dataVersion`, dựng `Tất cả` trước để tính các tháng một lần, rồi upsert từng bundle tháng và `Tất cả` với cùng metadata/hash.

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

- `anon` và `authenticated` chỉ được `select`.
- Apps Script dùng service role key để ghi.

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
4. Frontend Vercel đọc bằng anon key.
5. Khi sửa/xóa danh mục qua web app, Apps Script ghi Google Sheet trước rồi sync lại cache liên quan.

RLS:

- `anon` và `authenticated` chỉ được `select`.
- Apps Script dùng service role key để ghi.

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
3. Apps Script upsert `recent_500` và các cache tháng đang có dữ liệu.
4. Khi nhập/sửa/xóa dữ liệu vận hành qua web app, Apps Script ghi Google Sheet trước rồi sync lại cache sheet liên quan và các tháng gần nhất.

RLS:

- `anon` và `authenticated` chỉ được `select`.
- Apps Script dùng service role key để ghi.

## Định hướng thông báo in-app

Không đọc trực tiếp `XL_DoiSoatChuyen` mỗi lần mở app vì sẽ chậm.

Luồng đúng cho thông báo:

1. Google Sheet vẫn tính đối soát/thưởng nóng trong `XL_DoiSoatChuyen`.
2. Apps Script trigger đọc sheet này theo chu kỳ 1-5 phút.
3. Apps Script ghi các sự kiện mới vào Supabase, ví dụ bảng `notification_events`.
4. Frontend chỉ đọc Supabase để hiển thị chuông thông báo, trạng thái đã đọc/chưa đọc.
5. Sau đó có thể mở rộng sang web push/PWA hoặc Telegram nếu cần thông báo ngoài app.

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

Log từng lần xử lý job, dùng để debug lỗi và làm nền cho retry/notification sau này.

Frontend hiện poll trạng thái qua Apps Script action `getWriteJobStatus`. Retry thủ công dùng `retryWriteJob(jobId)`. Worker Apps Script chạy `processWriteJobs()` bằng trigger 1 phút, cài bằng `installWriteJobTrigger()`.

Write queue v2 hiện hỗ trợ `transport/submitRows`, `transport/saveSheetRow` và queued delete chỉ khi xóa nội dung cột:

- `ASYNC_TRANSPORT_WRITE_ENABLED=true` cho nhập mới/sửa Vận hành.
- `ASYNC_WRITE_ENABLED=false` vẫn giữ để không bật lại các luồng async v1 đại trà.
- POST `submitRows`/`saveSheetRow` tạo job `pending`; xóa nguyên dòng không vào queue để tránh retry xóa nhầm dòng kế tiếp.
- Worker ghi Google Sheet bằng `EntryService.submitRows()`, sau đó sync nhanh cache Vận hành liên quan.
- Action `getRecentWriteJobs` cho phép frontend khôi phục job gần đây sau khi reload, dùng để hiển thị lại pending/synced tạm thời trong bảng Vận hành và Tổng quan.

Migration `006_write_queue_hardening.sql` bổ sung `idempotency_key`, `worker_id`, `claimed_at` và RPC `claim_write_jobs()`. RPC claim atomically bằng `FOR UPDATE SKIP LOCKED`, chỉ lấy `pending` hoặc `processing` quá 5 phút. Append Vận hành giữ `jobId` trong Developer Metadata của vùng Sheet để retry không append dòng mới.

Pilot Quỹ dùng `module=fund`, `action=addFundTransactions`. Voucher được sinh trước và lưu trong payload; worker kiểm tra toàn bộ voucher trước khi append. Flag `ASYNC_FUND_TRANSACTION_ADD_ENABLED` đọc từ Script Properties, mặc định false trong code và đã bật true trên production ngày 2026-07-10. Pending Quỹ không được cộng vào KPI trước khi job `synced`.

### `public.app_users`

Allowlist cho Supabase Auth nội bộ, gồm `user_id`, `username`, email kỹ thuật, `role`, `active`, `display_name`, `created_at`, `updated_at`. Giao diện đăng nhập bằng username/password; frontend chuyển username thành địa chỉ kỹ thuật `username@dongbac.internal`, không yêu cầu email thật. Migration `007_auth_hardening.sql` tạo allowlist; migration `008_authenticated_read_cutover.sql` thu hồi quyền `anon`; migration `009_shareholder_role.sql` thêm role `shareholder`.

Role ứng dụng:

- `admin`: toàn quyền nghiệp vụ và quản lý tài khoản.
- `operator`: đọc/ghi nghiệp vụ, không quản lý tài khoản.
- `shareholder`: chỉ đọc báo cáo, bảng Vận hành, giao dịch Thu chi và khoản vay. Proxy từ chối action ghi bằng HTTP 403.

RLS cho phép user `authenticated` đang active đọc cache; ghi cache/queue vẫn chỉ dùng service role. Phân quyền action chi tiết được thực thi tại Vercel API proxy, không dựa riêng vào việc ẩn nút frontend.
