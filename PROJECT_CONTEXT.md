# PROJECT_CONTEXT

Current-state handoff duy nhất. Khi bắt đầu phiên mới, đọc toàn bộ `AGENTS.md`, file này và `git status --short`; dùng [router](docs/ai/AI_START_HERE.md) cho tài liệu chuyên biệt. Cập nhật 24/10/2026 ICT.

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

- Điều chỉnh UX bộ chọn năm ở header đã deploy Production ngày 24/10 và được đóng source tại commit `b2aa042`: năm `ready` (2027) vẫn tồn tại cho quy trình rollover nội bộ nhưng không còn nằm trong `availableYears` công khai và không thể được người dùng chọn trực tiếp; header chỉ hiện bộ chọn khi có từ hai năm `active`/`archived`, chỉ hiển thị số năm và giữ tên truy cập `Năm dữ liệu` qua `aria-label`. Cookie năm cũ không còn công khai sẽ tự rơi về năm `active`. Authenticated Preview/Production QA xác nhận 2026 tải dữ liệu, header không còn control/text thừa và 2027 trả 404. Bảy file runtime/test khớp từng byte với cutover manifest; full 935 tests, SQL 001–020, lint, typecheck, build/identity, dependency audit, secret scan và diff-check đều PASS.
- Audit/khắc phục A01–A07 và checkpoint U01–U04 đã được commit tại `3f3385d`, đưa qua PR #2 rồi PR #3 sau security rewrite, và deploy Preview ngày 24/10. Review đã sửa ba lỗi trong chính candidate: Developer Metadata location dùng API Apps Script không tồn tại (`getRange`), metadata được gắn lên numeric range thay vì row dimension thật, và registry có dữ liệu vẫn giữ năm chỉ tồn tại ở env. Journal dùng row marker + intent hash để bảo vệ append Vận tải/Danh mục; Fund range yêu cầu coverage tháng có bằng chứng và giữ `limited/incomplete` tới UI. Full 933 tests, SQL 001–020 kèm retry/ABA, lint/typecheck/build/identity/diff-check PASS; production deps 0, dev 1 High ở transitive `zod`. [Báo cáo audit](docs/quality/AUDIT_REPORT.md) giữ phạm vi, file, evidence và giới hạn.
- U01/U04 journal đã chạy PASS trên Apps Script và Google Sheet thật trong project canary tách biệt ngày 24/10. Lần chạy đầu sau khi xác minh tài khoản phát hiện Apps Script từ chối metadata trên numeric full-width range; candidate đã đổi sang row dimension A1 `N:N`, bổ sung regression rồi chạy lại PASS các kịch bản exact replay, row shift, crash-before-write, partial/drift/hash, missing marker, split block và occupied target. Hai spreadsheet dữ liệu giả đều được đưa vào Thùng rác qua `finally`; project canary cũng đã trở lại Thùng rác.
- U02/U03 Fund coverage canary read-only ngày 24/10 PASS với metadata cache thật qua phiên Production đã xác thực: nguồn hiện có 05–10/2026, bốn tháng 01–04 pre-data được candidate chấp nhận khi có coverage đồng nhất; fixture rút gọn 282/282 giao dịch, `limited=false`, `incomplete=false`. Fault cases thiếu tháng đã biết, internal/trailing gap, selectedMonth lệch, coverage lệch/mất và limited provenance đều fail closed/pass regression. Authenticated QA candidate trên Preview PASS: Quỹ 2026 tải khoảng 01/01–24/10 với 1.340 giao dịch, phân trang 1–20 → 21–40; năm 2027 hiển thị chỉ đọc và không có nút thêm/sửa/xóa. Không gửi giao dịch; phiên đã trả về 2026.
- `year-rollover-self-service` đã deploy Production. Audit cuối `39fff5a9-7fc0-4452-b6ad-ccd7a868a5dc` là `ready`; 2026 vẫn active, 2027 chỉ đọc; chưa tạo confirmation token, pause writes hoặc chuyển trigger sang 2027.
- Sự cố ba cảnh báo ngày 23/10 đã đóng. `api/notification-dispatch.js` truyền lại đúng `workbookContextService`; `AppConfig.gs` chấp nhận explicit `year=2026`; bundle chuyến xe và vận hành đã làm mới. `notification_pipeline`, `trip_notifications`, `operational_notifications` đều `ok`; Production không còn “Lỗi đồng bộ”, badge còn một thông báo nghiệp vụ chưa đọc.
- Production Vercel: `dpl_Ff2u5zzKtkSBuSDBHh1DTuqv1iGR`. Rollback tức thời: `dpl_GBoatQF8rDwzLNtddtRr79wULwSL`. Full pre-feature rollback: `dpl_41LPARvygaP9ZUFFK2hV4PYHm9CB`. Cutover record: `artifacts/year-header-production-20261024/cutover.json`; source tree SHA256 `8796464b125c8d55d6786a1fb9757370d4584965ed1cbe68a9af1840f693732c`.
- Preview ổn định: `https://vantaidongbac-preview.vercel.app`, deployment `dpl_3AsaDD6cGMijzHpih2r2zpFro6nT`. Deploy script xác nhận HTTP 200, title `Vận tải Đông Bắc`, không chuyển tới Vercel Login, health `businessWritesPaused=true`, không lộ `spreadsheetId`; authenticated QA PASS. Production alias duy nhất: `https://dongbac.vercel.app`.
- GitHub `ngotuong/VanTaiDongBac` đã chuyển Public ngày 24/10. Trước khi đổi visibility, toàn bộ branch/tag được rewrite để loại `client_secret.json` lịch sử; 3.715 blob sau rewrite không còn finding credential/token/key, tip tree của 4 branch và 5 tag giữ nguyên. Secret Scanning và Push Protection đã bật. Bundle lịch sử cũ được giữ cục bộ ngoài repo với quyền `600`, không được push hoặc chia sẻ.
- Apps Script Production/Preview đều version 425; paired rollback 424. Migrations 001–020 đã live và không rollback ngược.
- Candidate audit gốc nằm tại commit `3f3385d`; thay đổi UX năm nằm tại `b2aa042`. PR #3 đã merge vào `main` ngày 24/10 bằng merge commit `eaf2b2b`; PR #2 đã đóng vì GitHub giữ snapshot SHA cũ sau security rewrite và không thể mở lại. Release Production hiện hành được khóa bằng source-tree hash trong cutover record. Full release gate 935 tests, SQL 001–020, lint, typecheck, build/identity, diff-check và production dependency audit PASS; GitHub Quality gates trên merge head PASS toàn bộ.
- Chi tiết các checkpoint đã đóng nằm trong Git history; file này chỉ giữ trạng thái đang có hiệu lực.

## 4. Checkpoint tiếp theo

- Production cutover, authenticated hậu kiểm, chuyển repository Public an toàn, GitHub Quality gates và merge source canonical vào `main` đã hoàn tất. Chưa có checkpoint phát triển lớn tiếp theo được phê duyệt; lựa chọn gần nhất là pagination giao dịch nguồn hoặc hai nghiệm thu quan sát R8. Vercel Git Integration đang tắt nên merge không tự deploy.
- Chuyển năm vẫn chưa được phép kích hoạt. Trước cửa sổ vận hành 2027 phải đóng gate audit liên quan, tạo audit mới/token, pause cả hai lớp ghi, drain queue/signal/lease, activate registry/properties/triggers, full sync 2027, authenticated QA rồi mở ghi.
- R8 còn hai nghiệm thu quan sát, không chặn vận hành hiện tại: một edit người dùng thật để đo edit→UI mục tiêu 1–2 phút và kiểm thử Safari/PWA/push trên iPhone vật lý. Không tạo giao dịch giả trong Production để đóng hai gate này.
- Theo dõi execution/error-rate sau các bản sửa trigger và notification; lỗi nền tảng Google 0 giây/hard timeout không thể được code bắt tuyệt đối. Không tắt email hoặc nới stale threshold để che lỗi.

## 5. Kiến trúc đích

- [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md) sở hữu đích dài hạn. Vận tải và Thu chi tiếp tục tách workbook theo năm; Supabase định tuyến/lưu read model nhưng không thay Sheets làm source of truth.
- Chuyển năm là cutover ghép cặp Vercel + Apps Script + Supabase + hai workbook, có pause/drain/audit/token và rollback. Không copy webapp vào từng Sheet.
- Source canonical cần được đưa về `main` sau review; Vercel Git Integration đang tắt nên push/merge không tự deploy.

## 6. Rủi ro và gate

1. Source canonical đã ở `main` qua merge commit `eaf2b2b`; GitHub Quality gates PASS trên merge head. Mọi thay đổi tiếp theo phải đi qua checkpoint/CI mới và không làm thay đổi Production ngoài quy trình deploy riêng.
2. Rollback hiện hành: Vercel `dpl_Ff2u5zzKtkSBuSDBHh1DTuqv1iGR` → `dpl_GBoatQF8rDwzLNtddtRr79wULwSL`; Apps Script 425 → 424. Giữ migrations 019–020, registry/cache/queue/journal; không restore toàn workbook hoặc clear pending/cursor.
3. Payroll nguồn tháng 5–8 và một số volume lịch sử còn `needs_review`; không sửa tiền nguồn để ép matched. Uncertain write phải đối soát exact job/journal/marker/row trước retry.
4. Production dependencies có 0 vulnerability; dev lint chain còn advisory chưa có bản vá tương thích. Web Push vẫn có residual at-least-once; tiếp tục theo dõi delivery ledger/log.
5. Alias cũ `vantaidongbac-legacy`, ba alias `next-canary` và alias Git C3 đã gỡ ngày 23/10. Không tái sử dụng `vantaidongbac-c3-preview.vercel.app`; Preview chỉ qua `npm run deploy:preview`.
6. Evidence cũ đã chuyển khỏi worktree sang `/Users/ngotuong/AppsScript/VanTaiDongBac_2026_WebApp_Archives/artifacts-through-20261023`, checksum tại file cùng tên đuôi `.sha256`. `artifacts/` local chỉ giữ evidence rollout/rollback ngày 23/10; không coi artifact là chỉ dẫn sống.
7. Candidate audit và điều chỉnh UX năm đã live trên Production ngày 24/10. Journal canary, Fund coverage canary, authenticated Preview/Production QA và post-cutover smoke PASS; 25 log gần nhất không có HTTP 5xx. A07 vẫn không bảo đảm chống trùng sau reload. Canary tách biệt không chứng minh tải/quota metadata, dữ liệu legacy Production hay toàn bộ worker/trigger; retry job chưa đối soát vẫn phải fail closed.
8. Public-history rewrite đổi SHA của 277 commit remote. Clone cũ phải rebase theo history mới hoặc clone lại, tuyệt đối không merge/push lịch sử cũ vì có thể tái đưa `client_secret.json` vào repo. PR #1 đã merge còn cached/hidden GitHub ref ngoài quyền force-push; file chứa Desktop OAuth public client, không phải user token, nhưng không được dùng lại hoặc công khai từ bundle backup.
