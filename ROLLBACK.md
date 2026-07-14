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
npm run build
clasp push
```

3. Redeploy Vercel từ commit cũ hoặc revert commit trên GitHub.

## Rollback presentation Next/D1

Production hiện tại là C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. D1 `dpl_8AdSfrkz764MjBwygZa7zr7ZM8d9` và các candidate C3 sai không nằm trên `dongbac.vercel.app`.

Candidate golden-master hiện tại là overlay interaction correction toàn diện `dpl_Fi2JXxP4kJPbYBaNvZkZ1i1ktUX3` tại `https://vantaidongbac-c3-preview.vercel.app`. Candidate dùng Production environment để có đủ biến server `sensitive`, nhưng được tạo với `--skip-domain`; `dongbac.vercel.app` vẫn trỏ C2 recovery. Entry correction trước đó là `dpl_CnvssuGUQgLED2YCEQMYG9t2bhAQ`; popup correction đầu `dpl_Dw7o14BkbLp77bNuXPZ6Q8ULctf9` đã bị người dùng từ chối visual; Cashflow candidate trước correction là `dpl_DxHVCvzd8Dc1ZZnDM8BGzPcNrrRc`, Catalog là `dpl_HohfDxtwRWx2AfEnvLgY2qVoAew5`, Manage/Entry correction là `dpl_4hT1vCRx88R9LeG2dn716oC6yvV2`. Nếu correction hiện tại lỗi, gán lại alias preview về Entry correction gần nhất hoặc bỏ alias; không đổi `dongbac.vercel.app`.

Rollback nhanh về giao diện legacy đã xác nhận ở C2:

```bash
vercel alias set vantaidongbac-jgy6r6mjj-ngotuong2105.vercel.app dongbac.vercel.app
```

Deployment recovery là `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. Sau rollback kiểm tra root, logo, Report latest, Cashflow, health và authenticated session. Không build lại legacy từ source D1.

Legacy C1 vẫn được giữ tại `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS` và alias `https://vantaidongbac-legacy.vercel.app`. Nếu recovery C2 không phù hợp, có thể gán alias legacy C1:

```bash
vercel alias set vantaidongbac-62q4v6vur-ngotuong2105.vercel.app dongbac.vercel.app
```

Sau rollback, không xóa deployment Next/D1. Không cut-forward candidate C3 nào cho đến khi toàn bộ `docs/quality/C3_PARITY_MATRIX.md` được phê duyệt.

Apps Script D1 API-only là deployment `AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw`, code version `@282`. Apps Script rollback là deployment `AKfycbzO8puBHqpuoA9_eYPROuNGoISJM6bI9HT53xigZY_xK-BmQdcRhd_rje4qGFGVPbF3Mg`, code version `@281`; rollback backend bằng cách khôi phục `APPS_SCRIPT_URL` về URL `@281` rồi redeploy Vercel.

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
