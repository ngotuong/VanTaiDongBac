# PROJECT_CONTEXT

File nay la handoff/living roadmap chinh cua du an. Khi bat dau mot cuoc tro chuyen moi, hay doc file nay truoc, sau do doc them `AGENTS.md`, `PROJECT_SCHEMA.md`, `SUPABASE_SCHEMA.md`, `WORKFLOW.md`, va `ROLLBACK.md` neu tac vu co lien quan.

## Muc tieu san pham

- Web app noi bo cho Van tai Dong Bac, deploy frontend tren Vercel.
- Apps Script la backend/API va van duoc dong bo bang clasp.
- Google Sheet Van tai va Google Sheet Thu chi van la nguon du lieu chuan.
- Supabase dung lam database/cache doc nhanh, khong thay the Google Sheet o giai doan hien tai.
- Nguoi dung noi bo khoang 4-5 nguoi, uu tien tra cuu nhanh, bao cao dung, nhap lieu an toan.

## Nguyen tac bat buoc

- Khong bo Google Sheet, Apps Script, hoac Vercel trong giai doan hien tai.
- Khong dua service role key vao frontend.
- Khong commit `.env` hoac secret key.
- Khong tu y doi ten sheet, doi thu tu cot, xoa cong thuc trong Google Sheet.
- Khong gop du lieu Van tai va Thu chi neu chua duoc yeu cau.
- Khi doc/ghi du lieu chinh, uu tien `SpreadsheetApp.openById(id)`.
- Moi thay doi lien quan bao cao phai uu tien tinh dung so lieu hon toc do.

## Trang thai hien tai

### Ha tang

- GitHub remote: `origin https://github.com/ngotuong/VanTaiDongBac.git`
- Frontend production: `https://dongbac.vercel.app`
- Apps Script deployment URL:
  `https://script.google.com/macros/s/AKfycbzTp7g9JdYsP4x1kgL5iymJc67Sq7q1qjjLP-bPH2MBBitrAt-xv2W0qJSR9b6di6KAUA/exec`
- Apps Script deployment moi nhat da xac nhan: `@194 - Refine mobile filters and personnel catalog`
- Supabase project da link va frontend dang doc bang anon key.

### Supabase cache da co

- `report_bundles`: Bao cao/Tong quan theo thang.
- `fund_overview_bundles`: Quy's tong quan.
- `fund_transaction_bundles`: Giao dich Quy, gom `recent_500` va `month:YYYY-MM`.
- `fund_loan_bundles`: Vay no.
- `sync_status`: trang thai sync.
- `startup_bundles`: cache man hinh khoi dong.
- `catalog_bundles`: cache danh muc/startup.
- `manage_data_bundles`: cache Van hanh `recent_500` va `month:YYYY-MM`.

### Frontend doc Supabase

- Man hinh dau/startup doc Supabase truoc, fallback Apps Script.
- Tong quan/Bao cao doc `report_bundles`.
- Quy doc cache Supabase cho tong quan, giao dich, vay no; giao dich co cache theo thang.
- Van hanh doc cache mac dinh/recent va theo thang khi co bo loc phu hop.
- Danh muc doc cache Supabase khi co.
- Neu Supabase loi/thieu cache, frontend fallback Apps Script.

## Quyet dinh gan day ve Bao cao

Ngay 2026-07-04, phat hien UI Bao cao bi sai so lieu va sai y nghia danh muc vi frontend tu dung lai bang:

- `Báo cáo tổng quan` tung bi dung tu `buildOverviewSummaryMatrix_(parsed.rows)` nen header/cot khong con dung nguyen goc Sheet.
- `Báo cáo chi tiết` tung bi dung tu `buildSelectedDetails(selected)` nen ten danh muc bi tu dat lai.
- KPI/cache tung match nham chu `lương` trong `khối lượng`, lam sai `payroll`.
- Cache chi tiet Supabase cua `05/2026` va `06/2026` tung bi lap so thang `07/2026`.

Da sua:

- `client_reports.html`: `Báo cáo tổng quan` render truc tiep `dashboard.overview.months`.
- `client_reports.html`: `Báo cáo chi tiết` render truc tiep `dashboard.overview.details`.
- `SheetService.gs`: chi match cot luong bang `chi phí lương` hoac `tổng lương`, khong match moi chu `lương`.
- `SheetService.gs`: tinh chi tiet thang bang sheet tam copy tu `BC_TongQuan`, set `B1` tren sheet tam, doc ket qua, roi xoa sheet tam. Khong con lam `BC_TongQuan!B1` goc tu nhay.
- Da sync lai Supabase `report_bundles` cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`.

Commit lien quan:

- `57745f0 Restore exact overview report data`
- `d623753 Render overview details without B1 cache`
- `f7c6ae6 Restore overview KPI without mutating month selector`

### PWA / App Icon (Ngày 2026-07-04)

- Tạo file SVG nguồn mới `assets/app-icon/app-icon-pwa-source.svg` loại bỏ chữ, scale 1.45x và căn giữa biểu tượng để tối ưu hiển thị trên di động.
- Thêm script `scripts/generate-icons.js` dùng `sharp` để tự động tạo bộ icon PNG (`apple-touch-icon.png` 180x180, `icon-192.png` 192x192, `icon-512.png` 512x512, `favicon.png` 32x32) và backup các file cũ vào `public/static/assets/backup/`.
- Thêm `"id": "/"` vào `manifest.json` để định danh PWA duy nhất theo chuẩn hiện đại.

## File tài liệu hiện hành

- `AGENTS.md`: quy tac lam viec bat buoc cho Codex.
- `PROJECT_CONTEXT.md`: file nay, dung de tiep tuc boi canh/lộ trình giua cac cuoc tro chuyen.
- `PROJECT_SCHEMA.md`: schema/ban do chi tiet Google Sheet, Apps Script, frontend.
- `SUPABASE_SCHEMA.md`: schema Supabase va mapping cache.
- `SUPABASE_SETUP.md`: huong dan lay key, dat bien moi truong, setup trigger.
- `WORKFLOW.md`: quy trinh hang ngay khi sua frontend, Apps Script, Supabase, deploy, rollback.
- `ROLLBACK.md`: cach rollback Supabase/cache/code.
- `README.md`: gioi thieu ngan va lenh deploy nhanh.

## Lo trinh tiep theo

### 1. Dong bang do dung cua Bao cao

- So sanh `Báo cáo tổng quan` va `Báo cáo chi tiết` tren web voi `BC_TongQuan` trong Google Sheet cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`.
- Khong toi uu them neu chua xac nhan so lieu dung.
- Neu can hien KPI tren card, uu tien lay gia tri tu bang goc/cache dung, khong tu suy dien cong thuc moi.

### 2. Tach sync theo module/thang

- Giam `syncRealtimeCache()` toan cuc vi chay lau.
- Uu tien cac ham sync nho:
  - report/dashboard thang vua thay doi
  - manage month vua ghi
  - fund transaction month vua ghi
  - startup/catalog chi sync khi danh muc doi
- Sau ghi tu web app, chi sync module/thang lien quan.

### 3. Gan realtime nhung van giu Google Sheet la source of truth

- Sua tay tren Google Sheet: trigger 5 phut dong bo cache.
- Ghi tu web app: ghi Google Sheet truoc, sau do sync nhanh cache lien quan de UI co du lieu som.
- Chua chuyen source-of-truth sang Supabase neu chua co quyet dinh rieng.

### 4. Thong bao va phan quyen

- Sau khi Bao cao va cache on dinh, thiet ke `notification_events` cho thong bao in-app tu `XL_DoiSoatChuyen`.
- Sau thong bao, thiet ke user/role toi thieu cho noi bo.
- Khong dua auth/role vao neu chua co luong du lieu chuan va rollback ro.

## Cach tiep tuc o cuoc tro chuyen moi

Nguoi dung chi can noi: "Doc `PROJECT_CONTEXT.md` va tiep tuc lo trinh." Codex moi phai:

1. Doc `AGENTS.md`.
2. Doc `PROJECT_CONTEXT.md`.
3. Neu sua schema/cache, doc `SUPABASE_SCHEMA.md`.
4. Neu deploy/rollback, doc `WORKFLOW.md` va `ROLLBACK.md`.
5. Kiem tra `git status --short` truoc khi sua.
6. Giai thich ke hoach ngan bang tieng Viet truoc khi edit.
