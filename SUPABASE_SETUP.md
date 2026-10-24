# SUPABASE_SETUP

Tài liệu này là runbook cấu hình/thẩm tra Supabase hiện hành. Chỉ thao tác trên project canonical đã được Environment Identity Guard xác nhận; không đưa key bí mật vào Git.

## 1. Bootstrap project mới (chỉ khi được phê duyệt)

1. Mở Supabase project.
2. Vào **SQL Editor**.
3. Apply migrations `001` đến `013` theo đúng thứ tự bằng quy trình migration được phê duyệt.
4. Không sửa migration đã chạy; correction tiếp theo dùng `014+`.

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

Trạng thái cache/retirement và deployment hiện hành do [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) sở hữu. Khi điều tra dual-run/compaction đã hoàn tất, tra Git history; không dùng deployment ID lịch sử để vận hành hiện tại.

Runtime đã khóa ở Supabase-only: `sheet`/`dual` không còn được chấp nhận, cache miss/lỗi tính trực tiếp từ sheet tạm và upsert lại `report_bundles`. Không xóa `SYS_ReportCache` thủ công. Chỉ chạy các wrapper `ReportCacheRetirementMigration` theo đúng thứ tự dry-run → refresh nếu cần → backup → prepare → approve → run; thao tác delete production vẫn cần phê duyệt destructive sau khi Preview gate PASS.

## 10. Web Push foundation

Sau migration `010`, apply migration additive:

```text
supabase/migrations/011_web_push_subscriptions.sql
```

Migration chỉ tạo bảng subscription server-only, không sửa cache/dữ liệu nghiệp vụ. Trên Vercel Production environment — cũng là environment mà script preview khóa sử dụng — đặt ba biến server-only:

```text
WEB_PUSH_VAPID_PUBLIC_KEY=<public VAPID key>
WEB_PUSH_VAPID_PRIVATE_KEY=<private VAPID key>
WEB_PUSH_VAPID_SUBJECT=https://dongbac.vercel.app
```

Không đặt private key với prefix `NEXT_PUBLIC_` hoặc `VITE_`. Sau deploy Preview, test trên `Cài đặt > Thông báo trên thiết bị`. iPhone/iPad phải Add to Home Screen và mở từ icon trước khi xin quyền. Rollback code có thể bỏ UI/API/service worker; migration `011` additive nên giữ nguyên bảng, hoặc xóa subscription rows bằng migration/operation riêng nếu cần thu hồi endpoint.

## 11. Cảnh báo số dư Quỹ

Apply migration additive `supabase/migrations/012_notification_rule_states.sql` sau `011`.

`POST /api/fund-alerts` chỉ cho admin chạy `dryRun` từ Cài đặt và tuyệt đối không gửi. `GET /api/fund-alerts` dành riêng cho Vercel Cron, yêu cầu `Authorization: Bearer $CRON_SECRET` và chỉ gửi khi `FUND_LOW_BALANCE_ALERT_ENABLED=true`.

Không thêm `crons` vào `vercel.json` trong checkpoint Preview: Vercel chỉ kích hoạt Cron trên production deployment, còn script Preview dùng `--prod --skip-domain`. Khi người dùng phê duyệt production riêng, cấu hình lịch `0 1 * * *` (01:00 UTC = 08:00 Việt Nam), tạo `CRON_SECRET` và bật `FUND_LOW_BALANCE_ALERT_ENABLED=true` trong cùng deployment production được phê duyệt.

Sau `012`, apply `supabase/migrations/013_notification_preferences_and_rule_configs.sql`. Migration tạo preferences theo tài khoản, cấu hình rule và audit log server-only. `/api/push` cho người dùng tự đổi preference của chính họ; `/api/fund-alerts` cho admin đọc/lưu rule hoặc dry-run bản nháp. Việc bật rule trong webapp chỉ đánh dấu cấu hình sẵn sàng, không tự tạo Vercel Cron hay bật feature flag production.

Vercel Hobby chỉ bảo đảm cron theo độ chính xác giờ; mốc `08:00` có thể chạy trong khung `08:00–08:59`. Đổi lịch cần deploy config riêng, không phải thao tác runtime từ webapp.

### 11.1. Delivery thông báo đa nguồn

Apps Script tick 5 phút có thể gọi `POST /api/notification-dispatch`, nhưng mặc định luôn tắt. Preview không bật delivery tự động. Khi production được phê duyệt, deploy Vercel trước rồi đặt Script Properties:

```text
NOTIFICATION_DISPATCH_ENABLED=true
NOTIFICATION_DISPATCH_URL=https://dongbac.vercel.app/api/notification-dispatch/
NOTIFICATION_DISPATCH_SECRET=<cùng giá trị CRON_SECRET của Vercel>
```

Lần chạy đầu chỉ tạo baseline cho cảnh báo đang active và không gửi. Các lần sau gom sự kiện mới theo nhóm; daily digest chỉ đánh giá trong giờ 12:00 Việt Nam và dùng dữ liệu của ngày liền trước. Rollback nhanh bằng `NOTIFICATION_DISPATCH_ENABLED=false`; không xóa subscription, preference hoặc rule state.

### 11.2. External sync watchdog

Endpoint server-only `/api/sync-watchdog` dùng secret riêng, không dùng chung `CRON_SECRET` hoặc secret notification dispatch. Đặt cùng một giá trị ngẫu nhiên mạnh tại:

```text
Vercel Production: SYNC_WATCHDOG_SECRET
GitHub Actions secret: SYNC_WATCHDOG_SECRET
```

Workflow `.github/workflows/sync-watchdog.yml` gọi Production mỗi 5 phút. Endpoint chỉ chấp nhận Bearer secret này, đọc heartbeat `realtime_cache_worker` và chỉ gọi Apps Script recovery khi worker stale. Canary cut-forward có thể dùng `POST` với body `{ "force": true }`; nhánh cưỡng bức vẫn bắt buộc cùng Bearer secret và không sửa giả heartbeat. Không đưa secret vào source, log hoặc tài liệu. Rollback scheduler bằng cách disable workflow; rollback endpoint bằng Vercel deployment bất biến.

Không suy diễn mọi HTTP 403 là OAuth bị thu hồi. Runtime phân loại:

- `deployment_access_denied`: Google chặn đường vào web deployment hoặc sai access/execute-as/account; kiểm tra `Manage deployments` và đúng tài khoản deploy trước.
- `authorization_required`: chỉ dùng khi Apps Script trả thông điệp OAuth rõ ràng.
- `error`: timeout/lỗi hạ tầng hoặc lỗi sync khác.

Quy trình chẩn đoán read-only trong Apps Script editor:

1. chạy `diagnoseSyncAuthorization()`;
2. nếu `authorizationRequired=true`, chạy `recoverSyncInfrastructure()` và chấp nhận đầy đủ scope;
3. nếu `authorizationRequired=false`, kiểm tra deployment chạy bằng đúng deployer và cho phép `Anyone`, sau đó redeploy cùng deployment ID;
4. xác nhận direct health và health qua Vercel đều HTTP 200, `realtime_cache_worker` tươi và queue không pending/failed.

GitHub `schedule` là best-effort và có thể trễ/bỏ lượt; cron `*/5` không phải cam kết SLA 5 phút. Không mô tả cơ chế này là phát hiện bảo đảm trong 5–15 phút nếu chưa có scheduler production khác được phê duyệt và kiểm chứng.

## 12. Giải trình lương server-only (`014`, đã apply)

Migration additive sau đã được apply trước khi runtime đọc/ghi bundle được triển khai:

```text
supabase/migrations/014_payroll_explanation_bundles.sql
```

Hậu kiểm bắt buộc:

- bảng có primary key `(spreadsheet_id, report_month, employee_key)`;
- RLS bật và không có policy cho browser;
- `anon`/`authenticated` không có table privilege;
- `service_role` có quyền đọc/ghi;
- runtime chỉ đồng bộ bundle sau khi migration thành công.

Migration không đọc hoặc sửa Google Sheet. Backfill đã chạy qua `syncPayrollExplanationMonthToSupabase('MM/YYYY')` sau khi Apps Script candidate chứa service mới được phê duyệt cho môi trường tương ứng.

### 12.1. Remediation R1 (`015`, đã apply 2026-09-26)

Migration `supabase/migrations/015_financial_write_and_server_only_hardening.sql` đã được apply trong checkpoint deploy riêng trước runtime R1 phụ thuộc RPC mới. Migration:

- thu hồi browser read trực tiếp trên `catalog_bundles`, `sync_status`, `write_jobs`, `write_job_logs`; Vercel/Apps Script tiếp tục dùng service role;
- tạo RPC service-role `replace_payroll_explanation_month(text,text,jsonb)` để thay một tháng giải trình trong một transaction;
- không đọc hoặc ghi Google Sheet và không xóa write job.

Hậu kiểm bắt buộc: `anon`/`authenticated` bị từ chối bốn bảng operational, các API same-origin tương ứng vẫn trả đúng theo RBAC, service role đọc/ghi được, RPC từ chối row lệch workbook/tháng và thay thế tháng hợp lệ atomically. Nếu migration thành công nhưng runtime chưa deploy, giữ schema; rollback runtime bằng deployment cũ. Mọi schema rollback tiếp theo phải là migration `016+`.

Nguồn tham khảo chính thức:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JavaScript installing](https://supabase.com/docs/reference/javascript/installing)
- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)

### R8 cache isolation (`017`)

Sau backup/gate và maintenance được duyệt, apply `017_payroll_v6_cache_isolation.sql` trước sync/API v6. Xác minh table/RPC v6 server-only, legacy table/RPC/hash/row count không đổi. Backfill v6 chỉ bằng runtime v6; so exact source_data_version với report. Không chạy v6 replacement vào bảng v5. Rollback runtime giữ migration/cache additive; current state tại PROJECT_CONTEXT và R8 runbook.

### R8 sequence log (`018`)

Apply `018_write_job_log_sequence_permissions.sql` sau 017 bằng transaction guarded trong cửa sổ được duyệt. Migration chỉ thu hẹp ACL của sequence hiện hữu; không tạo/xóa job, đổi ID hoặc sửa Sheet. Hậu kiểm history/source, browser không USAGE/SELECT/UPDATE, service_role chỉ USAGE và vẫn INSERT log; sequence value, counts/queue giữ nguyên. Test database mới phải chạy worker/repository thực bằng service_role. Rollback runtime giữ 018; correction dùng migration forward, không cấp lại browser privileges.

### Namespace cache nhiều năm (`019`, chưa apply)

`019_multi_year_cache_namespace.sql` là migration additive cho runtime chọn workbook theo năm. Migration sao chép startup/catalog/manage legacy sang namespace 2026, giữ nguyên row legacy và không sửa Google Sheet. Chỉ apply trong cửa sổ được phê duyệt sau backup/gate; chạy lại phải idempotent. Runtime candidate phải qua Preview với exact `WORKBOOK_CONTEXTS_JSON` trước khi đổi `DEFAULT_WORKBOOK_YEAR`. Quy trình đầy đủ tại [YEAR_ROLLOVER](docs/operations/YEAR_ROLLOVER.md).

### Registry và tạo workbook năm mới (`020`, chưa apply)

Apply `020_year_rollover_self_service.sql` sau `019` trong cùng cửa sổ schema đã được duyệt. Migration tạo hai bảng server-only và RPC activation transactional; không đọc/ghi Google Sheet và không tự seed Spreadsheet ID. Hậu kiểm bắt buộc:

- `anon`/`authenticated` không đọc được `workbook_contexts`, `workbook_rollover_runs` và không gọi được RPC;
- service role đọc/ghi được registry;
- partial unique index từ chối hai năm `active`;
- RPC chỉ nhận năm liền kề, target `ready` và đổi trạng thái trong một transaction;
- trước khi registry có dữ liệu, runtime vẫn resolve exact allowlist Vercel hiện hành.

Sau migration mới deploy candidate Apps Script có Drive scope và webapp Preview. Owner cấp OAuth một lần, rồi cấu hình manifest exact theo [YEAR_ROLLOVER](docs/operations/YEAR_ROLLOVER.md). Việc apply `020` không tự tạo file, đổi năm active, trigger hoặc default year. Rollback runtime giữ schema additive; correction dùng migration forward.
