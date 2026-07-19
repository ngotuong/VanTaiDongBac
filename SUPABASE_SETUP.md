# Thiết lập Supabase giai đoạn 1

Tài liệu này dùng cho project Supabase trống. Chỉ copy/paste các phần cần thiết, không đưa key bí mật vào GitHub.

## 1. Tạo bảng trong Supabase

1. Mở Supabase project.
2. Vào **SQL Editor**.
3. Mở file `supabase/migrations/001_report_bundles.sql`.
4. Copy toàn bộ SQL.
5. Paste vào SQL Editor và bấm **Run**.

## 2. Lấy Project URL và keys

Trong Supabase Dashboard:

1. Mở project.
2. Vào **Project Settings**.
3. Vào **API** hoặc nút **Connect** nếu giao diện Supabase đang dùng luồng mới.
4. Copy **Project URL**.
5. Copy **anon/public/publishable key** để dùng cho frontend.
6. Copy **service_role key** hoặc **secret key** để Apps Script ghi dữ liệu.

Lưu ý an toàn:

- Anon/publishable key được dùng ở frontend, nhưng vẫn phải bật RLS.
- Service role/secret key chỉ đặt trong Apps Script Properties, không đưa vào frontend.
- Không lưu service role key trong `.env`, code, README, ảnh chụp màn hình, hoặc GitHub.

## 3. Đặt biến môi trường trên Vercel

Trong Vercel:

1. Mở project frontend.
2. Vào **Settings**.
3. Vào **Environment Variables**.
4. Thêm các biến:

```text
VITE_APP_SERVICE_URL=URL Web App Apps Script hiện đang chạy
VITE_SUPABASE_URL=Project URL lấy từ Supabase
VITE_SUPABASE_ANON_KEY=anon/public/publishable key lấy từ Supabase
VITE_SUPABASE_REPORTS_ENABLED=true
```

5. `VITE_APP_SERVICE_URL` lấy trong Apps Script: **Deploy** → **Manage deployments** → copy **Web app URL** của deployment đang dùng.
6. Chọn môi trường cần dùng, thường là **Production**, **Preview**, và **Development** nếu anh deploy đủ các môi trường.
7. Redeploy Vercel sau khi thêm biến.

Repo đã có `package.json` và `vercel.json` để Vercel chạy Next build:

```bash
npm run build:next-accounts
```

Nếu Vercel Project Settings đang override build command, hãy đặt:

```text
Build Command: npm run build:next-accounts
Framework Preset: Next.js
```

Muốn rollback nhanh trên frontend:

```text
VITE_SUPABASE_REPORTS_ENABLED=false
```

Sau đó redeploy.

## 4. Đặt key bí mật trong Apps Script Properties

Trong Apps Script:

1. Mở project Apps Script độc lập.
2. Vào **Project Settings**.
3. Kéo tới **Script Properties**.
4. Thêm các property:

```text
SUPABASE_URL=Project URL lấy từ Supabase
SUPABASE_ANON_KEY=anon/public/publishable key lấy từ Supabase
SUPABASE_REPORTS_ENABLED=false
REPORT_CACHE_MODE=sheet
SUPABASE_SERVICE_ROLE_KEY=service_role key hoặc secret key
```

Giải thích:

- `SUPABASE_URL`: dùng cho Apps Script ghi/cache sync.
- `SUPABASE_ANON_KEY`: public key tương thích cho các integration còn cần.
- `SUPABASE_REPORTS_ENABLED=false`: tắt read-cache compatibility phía Apps Script khi cần.
- `REPORT_CACHE_MODE=sheet`: rollback an toàn về cache Sheet. E1.3 đã đạt dual-run parity và hiện giữ `dual`; chỉ bật `supabase` sau khi E1.4 cutover được phê duyệt riêng.
- `SUPABASE_SERVICE_ROLE_KEY`: key bí mật để Apps Script ghi dữ liệu sang Supabase.

## 5. Chạy test sync thủ công

Sau khi `clasp push` code mới lên Apps Script:

1. Mở Apps Script editor.
2. Chọn function `syncAllReportBundlesToSupabase`.
3. Bấm **Run**.
4. Lần đầu Google sẽ hỏi quyền, bấm review và cấp quyền.
5. Nếu chạy thành công, kết quả trả về có `ok: true`.
6. Vào Supabase **Table Editor** → `report_bundles` để kiểm tra có nhiều row, mỗi row là một tháng báo cáo.

Sync tháng cụ thể:

```javascript
syncReportBundleToSupabase('6')
```

Tên tháng phải khớp giá trị mà app đang dùng trong báo cáo.

Sync toàn bộ các tháng:

```javascript
syncAllReportBundlesToSupabase()
```

Sync dữ liệu màn hình đầu và Danh mục:

```javascript
syncAllStartupAndCatalogsToSupabase()
```

## 6. Kiểm tra frontend

1. Redeploy Vercel với `VITE_SUPABASE_REPORTS_ENABLED=true`.
2. Mở web app.
3. Refresh lại từ đầu. Nếu cache đã có, màn hình loading đầu sẽ hiện nhanh hơn và có toast “Màn hình đầu đang đọc từ Supabase cache.”
4. Vào màn hình **Báo cáo**, **Tổng quan**, **Quỹ** và **Danh mục**.
5. Nếu Supabase có dữ liệu, app đọc nhanh từ Supabase.
6. Nếu Supabase chưa có dữ liệu, app tự fallback về Apps Script cũ.

## 7. Bật cập nhật gần realtime

Sau khi đã chạy migration `002_realtime_cache.sql` và deploy Apps Script mới:

1. Mở Apps Script editor.
2. Chạy function:

```javascript
syncRealtimeCache()
```

3. Nếu thành công, chạy function:

```javascript
installSupabaseSyncTriggers()
```

4. Vào mục **Triggers** trong Apps Script để kiểm tra có trigger `syncRealtimeCache` chạy mỗi 1 phút.

Trigger này chạy tick nhỏ mỗi 1 phút; installable trigger theo file Vận tải có thể cập nhật sớm hơn khi sửa tay các sheet `NL_*`.

## 8. Bật đăng nhập nội bộ và API proxy

Thực hiện đúng thứ tự để không tự khóa production:

1. Chạy migration `006_write_queue_hardening.sql`, sau đó `007_auth_hardening.sql` để tạo allowlist nhưng chưa thu hồi anon read.
2. Bật Email provider trong Supabase Auth. Tài khoản nội bộ dùng email kỹ thuật dạng `<username>@dongbac.internal`, nhưng giao diện chỉ hiển thị tên đăng nhập.
3. Tạo Auth user bằng Admin API, sau đó thêm `user_id`, `username`, email kỹ thuật, `role` và `display_name` vào `app_users`; không commit thông tin tài khoản vào repo.
4. Đặt Vercel server env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APPS_SCRIPT_URL`, `APP_PROXY_SECRET`.
5. Đặt frontend env `VITE_AUTH_ENABLED=true`; giữ service role/proxy secret không có prefix `VITE_`.
6. Đặt Apps Script Properties `APP_PROXY_SECRET` cùng giá trị, `AUTH_ENABLED=true`, nhưng giữ `AUTH_ENFORCEMENT_ENABLED=false` trong lần deploy đầu.
7. Deploy proxy/frontend với auth, đăng nhập bằng tài khoản nội bộ và test `/api/app?action=authSession`.
8. Chạy migration `008_authenticated_read_cutover.sql` để thu hồi anon read, rồi kiểm tra cache vẫn đọc được bằng JWT.
9. Cuối cùng mới đặt `AUTH_ENFORCEMENT_ENABLED=true` rồi deploy Apps Script version mới. Test gọi thẳng Apps Script bị từ chối và proxy vẫn hoạt động.

Không chạy migration `008` trước khi đã có ít nhất một tài khoản trong `app_users` và proxy/frontend sẵn sàng, vì migration này thu hồi quyền đọc `anon`.

Sau khi auth đã hoạt động, chạy thêm migration `009_shareholder_role.sql`. Quản trị viên có thể tạo tài khoản ngay trong `Cài đặt > Quản lý tài khoản`; không cần tạo thủ công bằng SQL. Chọn `Cổ đông (chỉ xem)` để cấp quyền xem báo cáo, Vận hành, giao dịch Thu chi và khoản vay mà không có quyền ghi.

Sau migration giai đoạn 3, `syncRealtimeCache()` đồng bộ thêm:

- `startup_bundles`: dữ liệu khởi động ban đầu.
- `catalog_bundles`: danh mục nhập liệu và bảng Danh mục.

## 9. Migration nền tảng report cache E1.1

Chạy migration mới sau `009_shareholder_role.sql`:

```text
supabase/migrations/010_report_cache_cutover_foundation.sql
```

Migration này giữ nguyên dữ liệu và khóa chính `(spreadsheet_id, report_month)`, chỉ thêm `cache_version`, `source_data_version`, `details_hash` cùng index/constraint phục vụ dual-run. Sau khi apply, vẫn giữ:

```text
REPORT_CACHE_MODE=sheet
```

Không xóa hoặc compact `SYS_ReportCache` ở E1.1 hoặc E1.2.

E1.3 đã đạt dual parity. E1.4 đã DONE với `REPORT_CACHE_MODE=supabase`: batch, nhiều trigger và force refresh authenticated preview/production giữ `SYS_ReportCache` ở dòng 198.900, tăng 0; Supabase đủ bốn row hiện hành có metadata hợp lệ. Production deployment ID hiện ở Apps Script `@290`, rollback cùng-ID là `@282`. Chưa compact/xóa `SYS_ReportCache`; E1.5 cleanup cần phê duyệt riêng và hàm migration có dry-run/backup.

Nguồn tham khảo chính thức:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JavaScript installing](https://supabase.com/docs/reference/javascript/installing)
- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)
