# Workflow làm việc hằng ngày

## Khi sửa frontend

1. Sửa các file source nhỏ như `client_*.html`, `styles_*.html`, `index.template.html`.
2. Chạy build:

```bash
node scripts/build.js
```

3. Kiểm tra `index.html` đã được tạo lại.
4. Commit lên GitHub.
5. Vercel tự deploy hoặc bấm redeploy nếu cần.

Không sửa tay logic trực tiếp trong `index.html` nếu logic đó có ở `client_*.html`, vì `index.html` là file build.

## Khi sửa Apps Script

1. Sửa file `.gs` hoặc `.html` trong repo.
2. Chạy build nếu có sửa frontend source:

```bash
node scripts/build.js
```

3. Push lên Apps Script:

```bash
clasp push
```

4. Test function thủ công trong Apps Script editor.
5. Nếu ổn, deploy phiên bản web app mới trong Apps Script khi cần.

## Khi sửa Supabase schema

1. Tạo file SQL mới trong `supabase/migrations/`.
2. Không sửa trực tiếp dữ liệu Google Sheet.
3. Copy SQL vào Supabase SQL Editor.
4. Run SQL.
5. Ghi rõ thay đổi vào `SUPABASE_SCHEMA.md`.
6. Commit file SQL và tài liệu.

## Khi đồng bộ dữ liệu báo cáo

1. Google Sheet vẫn là nguồn chuẩn.
2. Kiểm tra báo cáo trong Google Sheet trước.
3. Chạy Apps Script function:

```javascript
syncAllReportBundlesToSupabase()
```

Hoặc chỉ sync tháng cụ thể:

```javascript
syncReportBundleToSupabase('6')
```

4. Kiểm tra bảng `report_bundles` trong Supabase.
5. Mở Vercel frontend và vào màn hình **Báo cáo**.

## Khi đồng bộ cache gần realtime

Chạy thủ công toàn bộ cache chính:

```javascript
syncRealtimeCache()
```

Cài trigger tự động 5 phút:

```javascript
installSupabaseSyncTriggers()
```

Trigger này không tự bật nếu chưa chạy hàm cài đặt. Khi đã cài, Apps Script sẽ cập nhật cache Supabase cho Tổng quan, Báo cáo và Quỹ khoảng mỗi 5 phút.

Sau giai đoạn 3, trigger này cũng cập nhật cache màn hình khởi động và Danh mục. Nếu chỉ muốn sync riêng phần này, chạy:

```javascript
syncAllStartupAndCatalogsToSupabase()
```

## Khi deploy

Frontend Vercel:

1. Commit code lên GitHub.
2. Vercel deploy từ GitHub.
3. Kiểm tra biến môi trường:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_REPORTS_ENABLED
```

Apps Script:

1. Chạy `node scripts/build.js` nếu có sửa frontend.
2. Chạy `clasp push`.
3. Deploy web app mới nếu thay đổi cần public ngay.

Supabase:

1. Chạy SQL migration bằng SQL Editor.
2. Không commit secret key.
3. Chạy sync test thủ công hoặc `syncRealtimeCache()`.
4. Kiểm tra Table Editor có row mới trong các bảng cache vừa thêm.

## Khi rollback

Rollback nhanh nhất là tắt feature flag Supabase:

```text
VITE_SUPABASE_REPORTS_ENABLED=false
```

Redeploy Vercel. Frontend sẽ đọc lại Apps Script như luồng cũ.
