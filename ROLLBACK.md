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

Trong chương trình E1, rollback cache chi tiết về Sheet bằng Script Property:

```text
REPORT_CACHE_MODE=sheet
```

Trong cửa sổ stabilization E1.4, rollback ít tốn tải hơn là `REPORT_CACHE_MODE=dual` nếu vẫn muốn shadow-write Supabase; dùng `sheet` khi cần tắt toàn bộ report-cache Supabase. Production Apps Script deployment ID hiện hữu có thể đưa từ `@290` về `@282` mà không đổi URL:

```bash
clasp deploy -i AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw -V 282 -d "Rollback E1.4 to D1 backend"
```

Giá trị trống/không hợp lệ cũng fallback về `sheet`. Migration `010` là additive nên không cần drop ba cột metadata khi rollback; giữ chúng nullable để tránh migration phá dữ liệu.

Nếu E1.5 đã compact `SYS_ReportCache` và post-check sai, không sửa tay hoặc đổi tên sheet. Bản full-workbook rollback trước compact là:

```text
BACKUP E1.5 - VanTaiDongBac_2026 - before SYS_ReportCache compaction - 2026-07-19
File ID: 132EMVW5MI_jxyTtVVuPoXfcXIkM1-v7YVfINC0xV164
```

Trước destructive pass, `REPORT_CACHE_E15_PREPARED_SNAPSHOT` phải khớp live fingerprint và `REPORT_CACHE_E15_DESTRUCTIVE_APPROVAL` chỉ tồn tại cho một lần chạy. Nếu migration abort trước xóa, chạy lại dry-run/prepare; không tái sử dụng approval cũ. Nếu đã xóa và cần rollback, trước hết giữ `REPORT_CACHE_MODE=supabase` để runtime không append Sheet, đối chiếu backup, rồi khôi phục riêng hidden sheet bằng một migration phục hồi được phê duyệt; không copy/paste thủ công và không phục hồi toàn workbook vì có thể ghi đè dữ liệu nghiệp vụ mới phát sinh sau thời điểm backup.

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
npm run build
clasp push
```

3. Redeploy Vercel từ commit cũ hoặc revert commit trên GitHub.

## Rollback presentation Next/D1

Production hiện tại là Auth session continuity `dpl_8f3resbHcr5ZNWMdV4PjP28Gm5yK`, được người dùng duyệt và promote ngày 2026-07-19. Rollback gần nhất là D1 `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx`; C3 interaction correction `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`, correction trước `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`, C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg` và D1 rollback cũ `dpl_8AdSfrkz764MjBwygZa7zr7ZM8d9` vẫn được giữ bất biến; interaction candidate bị bác bỏ `dpl_9HKgcJQZoZJcj1co5xd8sTdemFKq` không được dùng để rollback.

Nếu session continuity có regression, rollback ngay alias về D1 đã xác nhận, không rebuild:

```bash
vercel alias set vantaidongbac-83265gbpa-ngotuong2105.vercel.app dongbac.vercel.app
```

Deployment đích là `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx`. Sau rollback kiểm tra unauthenticated session 401, authenticated Dashboard/Report reload và health 200.

D1 đã đạt source/HTTP/authenticated preview, public post-cutover và authenticated production gate. Vercel Production environment hiện trỏ Apps Script API-only `@290`. Nếu cần rollback tiếp từ D1 về C3, gán alias về C3 đã xác nhận, không rebuild:

```bash
vercel alias set vantaidongbac-fqvm2e2yv-ngotuong2105.vercel.app dongbac.vercel.app
```

Deployment đích là `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`. Sau rollback, nếu cần build mới thì khôi phục `APPS_SCRIPT_URL` project environment về recovery `@281` trước build.

Từ C3 interaction correction, rollback tiếp về correction C3 trước:

```bash
vercel alias set vantaidongbac-kisby95be-ngotuong2105.vercel.app dongbac.vercel.app
```

Deployment đích của rollback gần nhất là `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`. Nếu regression liên quan toàn bộ C3, dùng C2 recovery ở bước dưới. Cut-forward C3 cũ `dpl_4W8Dyj2DE6WjUXoojmVmC2dugeee` đã bị rollback do Report thiếu total/profit rows, mobile empty state và hiệu năng chuyển route; Cashflow cascade correction trước đó là `dpl_CSAZkHAftQEB6xyNGJzjMRGpNXRL`.

Rollback nhanh về giao diện legacy đã xác nhận ở C2:

```bash
vercel alias set vantaidongbac-jgy6r6mjj-ngotuong2105.vercel.app dongbac.vercel.app
```

Deployment recovery là `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. Sau rollback kiểm tra root, logo, Report latest, Cashflow, health và authenticated session. Không build lại legacy từ source D1.

Legacy C1 vẫn được giữ tại `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS` và alias `https://vantaidongbac-legacy.vercel.app`. Nếu recovery C2 không phù hợp, có thể gán alias legacy C1:

```bash
vercel alias set vantaidongbac-62q4v6vur-ngotuong2105.vercel.app dongbac.vercel.app
```

Sau rollback, không xóa deployment Next/D1. Không cut-forward lại candidate nào nếu chưa có authenticated user approval và parity matrix tương ứng.

Apps Script D1 API-only deployment `AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw` hiện chạy E1.4 `@290`; rollback trực tiếp là cập nhật cùng deployment về `@282`. Deployment recovery riêng `AKfycbzO8puBHqpuoA9_eYPROuNGoISJM6bI9HT53xigZY_xK-BmQdcRhd_rje4qGFGVPbF3Mg` vẫn ở `@281`; chỉ đổi `APPS_SCRIPT_URL` sang URL recovery và redeploy Vercel khi rollback cùng-ID không đủ.

## Dấu hiệu rollback thành công

- Màn hình **Báo cáo** vẫn mở được.
- Màn hình loading đầu vẫn vào được dù không có Supabase.
- Màn hình **Vận hành** vẫn đọc được qua Apps Script.
- Màn hình **Danh mục** vẫn đọc được qua Apps Script.
- Không cần bảng `report_bundles`.
- Không cần Supabase URL/key.
- Dữ liệu hiển thị khớp luồng Apps Script cũ.

## Rollback Auth / API proxy

1. Đặt Apps Script Property `AUTH_ENFORCEMENT_ENABLED=false` trước để khôi phục API cũ.
2. Đặt Vercel `VITE_AUTH_ENABLED=false` và redeploy frontend nếu proxy/auth lỗi diện rộng.
3. Không xóa `app_users`; giữ allowlist để có thể bật lại.
4. Nếu cần khôi phục anon read tạm thời, tạo migration mới phục hồi policy; không sửa/xóa migration `008` đã chạy.
5. Rotate `APP_PROXY_SECRET` ở cả Vercel và Apps Script nếu nghi ngờ bị lộ.

Migration `009` chỉ mở rộng giá trị role và thêm `updated_at`, không cần rollback schema. Nếu cần tạm ngừng tài khoản cổ đông, đặt `active=false` trong `app_users` hoặc thao tác tại `Cài đặt > Quản lý tài khoản`. Không đổi role constraint ngược lại khi vẫn còn row `shareholder`.

## Rollback Queue hardening / pilot Quỹ

- Tắt `ASYNC_FUND_TRANSACTION_ADD_ENABLED=false` để thao tác thêm Thu chi quay về ghi trực tiếp.
- Có thể giữ migration `006`; cột/RPC mới tương thích với dữ liệu job cũ.
- Không rollback bằng cách bật lại worker đọc mọi job `processing`; dùng RPC atomic claim.
- Nếu RPC lỗi, tạm tắt các flag queue trước khi deploy code cũ. Các job `pending` phải được kiểm tra thủ công trước khi retry để tránh ghi hai lần.
