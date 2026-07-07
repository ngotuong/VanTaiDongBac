# Supabase schema giai đoạn 1

## Phạm vi thử nghiệm

Giai đoạn 1 chỉ dùng Supabase làm database/cache cho màn hình **Báo cáo**. Google Sheet vẫn là nguồn dữ liệu chuẩn. Apps Script vẫn đọc Google Sheet, gom dữ liệu báo cáo thành một payload JSON, rồi ghi một chiều sang Supabase.

Màn hình chọn thử nghiệm: `Báo cáo`

Nguồn Google Sheet:

- `BC_TongQuan`
- `BC_BangLuong`
- `BC_TongHopXe`

Frontend đọc thử từ Supabase trong hàm `loadReportBundle()` tại `client_data.html`. Nếu Supabase chưa cấu hình, chưa có dữ liệu, hoặc bị lỗi, frontend tự quay về API Apps Script cũ `getReportBundle`.

## Bảng `public.report_bundles`

| Cột | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `spreadsheet_id` | `text` | Có | ID file Google Sheet vận tải theo năm. |
| `report_month` | `text` | Có | Tháng báo cáo, ví dụ `1`, `2`, `Tất cả`, hoặc tháng được frontend chọn. |
| `source_sheet_names` | `text[]` | Có | Danh sách sheet nguồn đã dùng để tạo payload. |
| `payload` | `jsonb` | Có | Dữ liệu trả về từ `ReportService.getReportBundle(month, true)`. |
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

## Luồng đồng bộ

1. Người dùng nhập/sửa dữ liệu như cũ trong web app hoặc Google Sheet.
2. Công thức trong Google Sheet tính các sheet báo cáo như cũ.
3. Chạy thủ công Apps Script function `testSupabaseReportSync()` hoặc `syncReportBundleToSupabase(month)`.
4. Apps Script đọc Google Sheet bằng `SpreadsheetApp.openById(APP_CONFIG.spreadsheetId)`.
5. Apps Script gọi Supabase REST API bằng `SUPABASE_SERVICE_ROLE_KEY` trong Script Properties.
6. Supabase lưu một row trong `report_bundles`.
7. Frontend Vercel đọc `report_bundles.payload` bằng anon key.
8. Nếu đọc Supabase lỗi, frontend tự gọi Apps Script `getReportBundle` như trước.

## File liên quan

- SQL migration: `supabase/migrations/001_report_bundles.sql`
- SQL migration realtime cache: `supabase/migrations/002_realtime_cache.sql`
- Apps Script sync: `SupabaseService.gs`
- API expose thủ công: `PublicApi.gs`, `Router.gs`
- Frontend Supabase client: `client_api.html`
- Frontend đọc báo cáo thử nghiệm: `client_data.html`

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

- `client_app.html` gọi `readStartupFromSupabase('vanChuyen')` trước.
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

- `client_data.html` đọc danh mục nhập liệu bằng `readCatalogsFromSupabase(formType)`.
- `client_catalog.html` đọc bảng Danh mục bằng `readCatalogDataFromSupabase(displaySheetName)`.
- `client_cashflow.html` đọc form options/danh mục Quỹ bằng `fund_form_options:YYYY` và `fund_catalog:YYYY:group`.
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

- `client_manage.html` đọc `recent_500` khi người dùng vào Vận hành ở trạng thái mặc định.
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

Từ ngày 2026-07-06, write queue v2 được bật hẹp cho `transport/submitRows`:

- `ASYNC_TRANSPORT_SUBMIT_ENABLED=true` cho nhập mới Vận hành.
- `ASYNC_WRITE_ENABLED=false` vẫn giữ để không bật lại các luồng async v1 đại trà.
- POST `submitRows` tạo job `pending` trong `write_jobs`, frontend nhận `jobId` nhanh và poll trạng thái.
- Worker ghi Google Sheet bằng `EntryService.submitRows()`, sau đó sync nhanh cache Vận hành liên quan.
- Action `getRecentWriteJobs` cho phép frontend khôi phục job gần đây sau khi reload, dùng để hiển thị lại pending/synced tạm thời trong bảng Vận hành và Tổng quan.
