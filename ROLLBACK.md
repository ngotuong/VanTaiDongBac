# Rollback Supabase giai đoạn 1

## Mục tiêu

Quay lại luồng cũ:

```text
Google Sheet -> Apps Script -> Frontend
```

Supabase chỉ là cache thử nghiệm nên có thể tắt mà không ảnh hưởng Google Sheet.

## Cách rollback nhanh trên Vercel

1. Mở Vercel project.
2. Vào **Settings** → **Environment Variables**.
3. Đổi:

```text
VITE_SUPABASE_REPORTS_ENABLED=false
```

4. Redeploy frontend.

Sau bước này, `loadReportBundle()` sẽ không đọc Supabase nữa và quay về Apps Script.

Các màn hình Tổng quan, Báo cáo, Quỹ, Vận hành, màn hình loading đầu và Danh mục cũng dùng cùng flag này. Khi tắt `VITE_SUPABASE_REPORTS_ENABLED`, toàn bộ cache Supabase ở frontend sẽ dừng đọc.

## Cách rollback trong Apps Script-hosted UI

Trong Apps Script **Script Properties**, đặt:

```text
SUPABASE_REPORTS_ENABLED=false
```

Nếu muốn ngừng hẳn khả năng ghi Supabase từ Apps Script, xóa property:

```text
SUPABASE_SERVICE_ROLE_KEY
```

Không cần xóa code ngay.

Nếu đã cài trigger gần realtime, có thể vào Apps Script **Triggers** và xóa trigger của function:

```text
syncRealtimeCache
```

Từ 2026-07-06, `syncRealtimeCache` là trigger tick mỗi 1 phút, không còn là full backfill. Full backfill thủ công là `syncFullRealtimeCache`.

## Nếu Supabase có dữ liệu sai

Không sửa Google Sheet theo Supabase. Google Sheet vẫn là nguồn chuẩn.

Có thể xóa cache Supabase bằng SQL:

```sql
delete from public.report_bundles
where spreadsheet_id = 'PASTE_SPREADSHEET_ID_HERE';
```

Xóa cache màn hình đầu và Danh mục nếu cần:

```sql
truncate table public.startup_bundles;
truncate table public.catalog_bundles;
```

Xóa cache Vận hành nếu cần:

```sql
truncate table public.manage_data_bundles;
```

Sau đó app sẽ fallback về Apps Script nếu không tìm thấy dữ liệu Supabase.

## Nếu cần rollback code

1. Revert commit tích hợp Supabase.
2. Chạy:

```bash
node scripts/build.js
clasp push
```

3. Redeploy Vercel từ commit cũ hoặc revert commit trên GitHub.

## Dấu hiệu rollback thành công

- Màn hình **Báo cáo** vẫn mở được.
- Màn hình loading đầu vẫn vào được dù không có Supabase.
- Màn hình **Vận hành** vẫn đọc được qua Apps Script.
- Màn hình **Danh mục** vẫn đọc được qua Apps Script.
- Không cần bảng `report_bundles`.
- Không cần Supabase URL/key.
- Dữ liệu hiển thị khớp luồng Apps Script cũ.
