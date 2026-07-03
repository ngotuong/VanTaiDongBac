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

Repo đã có `package.json` và `vercel.json` để Vercel chạy build:

```bash
node scripts/build.js
```

Nếu Vercel Project Settings đang override build command, hãy đặt:

```text
Build Command: node scripts/build.js
Output Directory: .
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
SUPABASE_SERVICE_ROLE_KEY=service_role key hoặc secret key
```

Giải thích:

- `SUPABASE_URL`: dùng cho Apps Script ghi và nếu cần render web app từ Apps Script.
- `SUPABASE_ANON_KEY`: chỉ là public key, dùng khi render frontend từ Apps Script nếu cần.
- `SUPABASE_REPORTS_ENABLED=false`: giữ Apps Script-hosted UI không tự đọc Supabase nếu chưa muốn.
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

## 6. Kiểm tra frontend

1. Redeploy Vercel với `VITE_SUPABASE_REPORTS_ENABLED=true`.
2. Mở web app.
3. Vào màn hình **Báo cáo**.
4. Nếu Supabase có dữ liệu tháng đang chọn, app đọc nhanh từ Supabase.
5. Nếu Supabase chưa có dữ liệu, app tự fallback về Apps Script cũ.

Nguồn tham khảo chính thức:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JavaScript installing](https://supabase.com/docs/reference/javascript/installing)
- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)
