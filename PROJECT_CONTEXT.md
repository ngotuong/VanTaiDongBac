# PROJECT_CONTEXT

Current-state handoff duy nhất. Khi bắt đầu phiên mới, đọc toàn bộ `AGENTS.md`, file này và `git status --short`; dùng [router](docs/ai/AI_START_HERE.md) cho tài liệu chuyên biệt. Cập nhật 23/10/2026 18:55 ICT.

## 1. Dự án và module

- Apps Script Web App standalone; Next.js/Vercel là lớp giao diện và API. Google Sheets vẫn là source of truth, Supabase giữ Auth/read model/cache/queue/thông báo.
- Hai module nghiệp vụ độc lập: Vận tải và Thu chi/Quỹ. Mỗi năm dùng một cặp workbook riêng; không gộp file, đổi tên sheet/thứ tự cột hoặc sửa công thức trực tiếp.
- Năm 2026 bắt đầu dữ liệu từ 05/2026 và đang `active`. `VanTaiDongBac_2027` cùng `ThuChiDongBac_2027` đã tạo, audit đạt 0 blocker/0 warning và đang `ready`/chỉ đọc. Chưa kích hoạt 2027.

## 2. Kiến trúc hiện tại

- Luồng chính: Browser → Next/Vercel API → Apps Script API-only → Google Sheets. Browser không nhận Spreadsheet ID hoặc server secret.
- Registry `workbook_contexts` từ migration `020` định tuyến cặp workbook theo năm. Cache, queue, signal, lease, cursor và write job mang namespace năm; năm không `active` bị chặn ghi.
- Bộ chọn năm và wizard admin đã live. `YearWorkbookProvisioningService` tạo bản sao đúng hai workbook bằng exact-range manifest; `YearRolloverMigration` giữ audit/token/activation/rollback. Runbook: [YEAR_ROLLOVER](docs/operations/YEAR_ROLLOVER.md).
- Runtime Apps Script 425 gồm trigger hardening, cache/queue nhiều năm và fallback `year=2026` khi request không mang Spreadsheet ID. Sáu trigger nghiệp vụ và watchdog vẫn hoạt động.
- Identity canonical: Supabase `lyquwesyjbpalnwfxzwl`; Vercel project `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`; Apps Script `1hNKU7xNvhORJSgv8mNIWKNguHU8bmCmM7mQBjxXLfv5FhawbN2HfJ2GX`.

## 3. Checkpoint gần nhất

- `year-rollover-self-service` đã deploy Production. Audit cuối `39fff5a9-7fc0-4452-b6ad-ccd7a868a5dc` là `ready`; 2026 vẫn active, 2027 chỉ đọc; chưa tạo confirmation token, pause writes hoặc chuyển trigger sang 2027.
- Sự cố ba cảnh báo ngày 23/10 đã đóng. `api/notification-dispatch.js` truyền lại đúng `workbookContextService`; `AppConfig.gs` chấp nhận explicit `year=2026`; bundle chuyến xe và vận hành đã làm mới. `notification_pipeline`, `trip_notifications`, `operational_notifications` đều `ok`; Production không còn “Lỗi đồng bộ”, badge còn một thông báo nghiệp vụ chưa đọc.
- Production Vercel: `dpl_GBoatQF8rDwzLNtddtRr79wULwSL`. Rollback tức thời: `dpl_FQZWP2fTYMJ6kLwR5yPVoTX54nVs`. Full pre-feature rollback: `dpl_41LPARvygaP9ZUFFK2hV4PYHm9CB`.
- Preview ổn định: `https://vantaidongbac-preview.vercel.app`, deployment `dpl_5g7dxwLJi1ZEjpRXiWPhfSPW1T8V`. Production alias duy nhất: `https://dongbac.vercel.app`.
- Apps Script Production/Preview đều version 425; paired rollback 424. Migrations 001–020 đã live và không rollback ngược.
- Source đã được gom vào commit `b6f2cf5` trên nhánh `codex/r8-mapping-optimization`. Full 907 tests, SQL 001–020, lint, typecheck, build/identity, diff-check và production dependency audit đều PASS trước commit.
- Chi tiết các checkpoint đã đóng nằm trong Git history; file này chỉ giữ trạng thái đang có hiệu lực.

## 4. Checkpoint tiếp theo

- Không còn code/deploy đã biết cần làm cho chức năng chuyển năm. Cửa sổ tiếp theo chỉ mở gần thời điểm vận hành 2027: tạo audit mới/token, pause cả hai lớp ghi, drain queue/signal/lease, activate registry/properties/triggers, full sync 2027, authenticated QA rồi mở ghi.
- R8 còn hai nghiệm thu quan sát, không chặn vận hành hiện tại: một edit người dùng thật để đo edit→UI mục tiêu 1–2 phút và kiểm thử Safari/PWA/push trên iPhone vật lý. Không tạo giao dịch giả trong Production để đóng hai gate này.
- Theo dõi execution/error-rate sau các bản sửa trigger và notification; lỗi nền tảng Google 0 giây/hard timeout không thể được code bắt tuyệt đối. Không tắt email hoặc nới stale threshold để che lỗi.

## 5. Kiến trúc đích

- [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md) sở hữu đích dài hạn. Vận tải và Thu chi tiếp tục tách workbook theo năm; Supabase định tuyến/lưu read model nhưng không thay Sheets làm source of truth.
- Chuyển năm là cutover ghép cặp Vercel + Apps Script + Supabase + hai workbook, có pause/drain/audit/token và rollback. Không copy webapp vào từng Sheet.
- Source canonical cần được đưa về `main` sau review; Vercel Git Integration đang tắt nên push/merge không tự deploy.

## 6. Rủi ro và gate

1. Nhánh hiện hành còn Draft PR #2 chưa merge. Không reset commit `b6f2cf5`; trước merge phải xác nhận CI đúng commit và không làm thay đổi Production ngoài quy trình deploy riêng.
2. Rollback hiện hành: Vercel `dpl_GBoatQF8rDwzLNtddtRr79wULwSL` → `dpl_FQZWP2fTYMJ6kLwR5yPVoTX54nVs`; Apps Script 425 → 424. Giữ migrations 019–020, registry/cache/queue/journal; không restore toàn workbook hoặc clear pending/cursor.
3. Payroll nguồn tháng 5–8 và một số volume lịch sử còn `needs_review`; không sửa tiền nguồn để ép matched. Uncertain write phải đối soát exact job/journal/marker/row trước retry.
4. Production dependencies có 0 vulnerability; dev lint chain còn advisory chưa có bản vá tương thích. Web Push vẫn có residual at-least-once; tiếp tục theo dõi delivery ledger/log.
5. Alias cũ `vantaidongbac-legacy`, ba alias `next-canary` và alias Git C3 đã gỡ ngày 23/10. Không tái sử dụng `vantaidongbac-c3-preview.vercel.app`; Preview chỉ qua `npm run deploy:preview`.
6. Evidence cũ đã chuyển khỏi worktree sang `/Users/ngotuong/AppsScript/VanTaiDongBac_2026_WebApp_Archives/artifacts-through-20261023`, checksum tại file cùng tên đuôi `.sha256`. `artifacts/` local chỉ giữ evidence rollout/rollback ngày 23/10; không coi artifact là chỉ dẫn sống.
