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
- Apps Script sync: `SupabaseService.gs`
- API expose thủ công: `PublicApi.gs`, `Router.gs`
- Frontend Supabase client: `client_api.html`
- Frontend đọc báo cáo thử nghiệm: `client_data.html`
