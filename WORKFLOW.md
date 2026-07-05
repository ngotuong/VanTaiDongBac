# Workflow làm việc hằng ngày

## Khi bắt đầu một cuộc trò chuyện mới với Codex

1. Yêu cầu Codex đọc `AGENTS.md`.
2. Yêu cầu Codex đọc `PROJECT_CONTEXT.md`.
3. Nếu công việc liên quan schema hoặc Supabase, đọc thêm `PROJECT_SCHEMA.md` và `SUPABASE_SCHEMA.md`.
4. Nếu công việc liên quan deploy/rollback, đọc thêm `WORKFLOW.md` và `ROLLBACK.md`.
5. Trước khi sửa code, luôn kiểm tra `git status --short`.

`PROJECT_CONTEXT.md` là nơi ghi trạng thái/lộ trình sống của dự án. Khi có quyết định mới, cập nhật file đó.

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

Sau giai đoạn 4, trigger này cũng cập nhật cache danh sách mặc định của menu Vận hành. Nếu chỉ muốn sync riêng phần này, chạy:

```javascript
syncAllManageDataToSupabase()
```

Nếu chỉ cần sync lại một tháng cụ thể của một sheet Vận hành:

```javascript
syncManageMonthToSupabase('NL_VanChuyen', '2026-07')
```

Frontend dùng cache `month:YYYY-MM` khi người dùng chọn đủ khoảng ngày trong menu Vận hành.

Nếu chỉ cần sync lại một tháng giao dịch Quỹ/Thu chi:

```javascript
syncFundTransactionMonthToSupabase('2026', '2026-07')
```

Frontend dùng cache `fund_transaction_bundles.filter_key = month:YYYY-MM` khi người dùng chọn đủ khoảng ngày trong tab Giao dịch Quỹ.

## Khi vận hành ghi bất đồng bộ

1. Schema queue nằm trong `supabase/migrations/005_write_jobs.sql`.
2. Worker Apps Script là `processWriteJobs()`, trigger 1 phút cài bằng `installWriteJobTrigger()`.
3. Nếu `clasp run` không đủ quyền cài trigger, lần enqueue đầu tiên sẽ tự thử cài trigger.
4. Trigger nhẹ `syncRecentManageDataCache()` làm tươi `recent_500` các sheet Vận hành mỗi phút để bắt các sửa/xóa tay trong Google Sheet.
5. Kiểm tra trạng thái job bằng `getWriteJobStatus(jobId)`.
6. Retry job lỗi bằng `retryWriteJob(jobId)`.
7. Log chi tiết nằm trong Supabase bảng `write_job_logs`.

## Khi deploy

Nguyen tac sau khi sua code thanh cong theo yeu cau cua user:

- Neu co sua Apps Script/backend: chay build neu can, `clasp push`, va deploy Apps Script.
- Neu co sua frontend/static: build lai `index.html`, commit + push GitHub de Vercel tu deploy; neu can thi chay redeploy Vercel thu cong.
- Neu co sua Supabase schema/cache contract: chay migration/sync can thiet va ghi lai tai lieu schema.
- Luon bao ro da deploy/push thanh cong hay buoc nao bi loi.

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
