# PROJECT_CONTEXT

## 1. Vai trò và cách sử dụng

Đây là handoff sống duy nhất dùng để trả lời nhanh sáu câu hỏi khi bắt đầu một cuộc trò chuyện mới:

1. Dự án là gì và gồm những module chính nào?
2. Kiến trúc production hiện tại đang ở trạng thái nào?
3. Checkpoint gần nhất đã hoàn thành là gì?
4. Checkpoint tiếp theo được đề xuất là gì?
5. Mục tiêu kiến trúc dài hạn là gì?
6. Rủi ro và điều kiện nào phải kiểm tra trước checkpoint tiếp theo?

Agent phải đọc `AGENTS.md`, sau đó đọc toàn bộ file này. Chỉ đọc tài liệu chuyên biệt được dẫn ở mục 10 khi tác vụ thực sự liên quan. Không dùng `REFACTOR_PLAN.md`, `AUDIT_REPORT.md`, commit message hoặc ghi chú checkpoint cũ để suy ra bước tiếp theo.

## 2. Dự án và mục tiêu sản phẩm

Vận tải Đông Bắc là web app nội bộ cho khoảng 4–5 người dùng, ưu tiên:

- tra cứu nhanh;
- báo cáo đúng với Google Sheet;
- nhập liệu an toàn;
- phân quyền rõ;
- có thể deploy và rollback từng checkpoint.

Đây là Apps Script Web App độc lập, không gắn cố định với một Google Sheet. Workbook được resolve theo request, năm và Script Properties; backend chính phải dùng `SpreadsheetApp.openById(id)`.

Hai domain nghiệp vụ độc lập:

1. **Vận tải**
   - dữ liệu theo từng năm trong workbook Vận tải riêng;
   - gồm Tổng quan, Báo cáo, Vận hành/Nhập liệu và Danh mục.
2. **Thu chi/Quỹ**
   - dữ liệu theo từng năm trong workbook Thu chi riêng;
   - gồm Tổng quan quỹ, Giao dịch, Khoản vay và Danh mục Quỹ;
   - là module/menu độc lập, không chỉ là nguồn import cho Vận tải.

Một số liên kết giữa hai workbook hiện do công thức Google Sheets/`IMPORTRANGE` thực hiện. Không gộp workbook hoặc thay đổi công thức nếu chưa có migration riêng được phê duyệt.

Các surface người dùng hiện có:

- Tổng quan/Dashboard;
- Báo cáo/Report;
- Vận hành/Manage và Nhập liệu/Entry;
- Danh mục Vận tải;
- Thu chi/Quỹ;
- Cài đặt/Tài khoản/Trạng thái đồng bộ.

## 3. Kiến trúc production hiện tại

### 3.1. Thành phần

```text
Browser
  └─ dongbac.vercel.app        -> Next.js App Router D1, Apps Script API-only (production stabilization)
  └─ D1 preview                -> cùng deployment bất biến đã được promote
          ↓
Vercel /api/app
  - xác thực Supabase session
  - kiểm tra allowlist/RBAC
  - xử lý account actions và Report cache
  - forward action hợp lệ tới Apps Script
          ↓
Apps Script standalone backend
  - application/domain services
  - Google Sheet adapters
  - worker/trigger/cache sync/audit
          ↓
Google Sheets + Supabase
```

Vai trò dữ liệu hiện tại:

- Google Sheets vẫn là source of truth và nguồn đối soát cuối cùng.
- Supabase cung cấp Auth, read cache/model, write queue và sync status.
- Apps Script là API/integration backend và cầu nối đồng bộ.
- Vercel cung cấp frontend và public API boundary; frontend không được giữ service role key.

### 3.2. Trạng thái Next.js thực tế

- Next.js `16.2.10`, React `19.2.7`.
- Source route/component tiếp tục nằm trong `next-shell/`; root `app/` là Vercel App Router entrypoint mỏng.
- `next.config.mjs` không còn `basePath` và không dùng `output: 'export'`; App Router phục vụ trực tiếp tại `/`.
- Production alias đã controlled cut-forward sang D1 `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx`; C3 interaction correction `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`, correction trước `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5` và C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg` vẫn READY để rollback.
- Root layout server-render auth/workbook context; chưa đăng nhập render LoginGate cùng-origin, đăng nhập tạo HttpOnly cookie qua `/api/session`.
- Các route Next độc lập hiện là production presentation trong giai đoạn stabilization; legacy C2 chỉ được giữ dưới dạng deployment rollback bất biến.
- Nhánh C3 mới `codex/c3-golden-master` bắt đầu từ nền Next sạch `a5e29bf`; nguồn C2 tại tree `73a0ede` được dùng làm golden reference, không khôi phục DOM bridge vào production.
- Vercel Production environment và deployment D1 hiện trỏ Apps Script API-only `@282`; recovery `@281` vẫn được giữ để rollback.

### 3.3. Luồng Report hiện tại

`/reports/` tải initial bundle ở Server Component; tương tác đổi tháng/làm mới đi qua Next same-origin boundary:

```text
Server Component / Next report-data -> GET /api/app?action=getReportBundle
        -> Vercel auth/RBAC
        -> Supabase report_bundles cache
        -> fallback Apps Script nếu miss/forceRefresh
        -> Google Sheet/report cache
```

Dashboard B2, Manage B3, Catalog B5 và Cashflow B6 giữ cache/fallback hiện hành. Entry B4 dùng catalog server-first, enqueue `submitRows`, kick worker, poll/retry write job và giữ Apps Script/Sheet services làm nơi validate/ghi có thẩm quyền. Catalog B5 dùng direct `saveSheetRow`/`deleteSheetRow`; Cashflow B6 dùng queue/idempotency cho thêm giao dịch và direct contract hiện hữu cho sửa/xóa giao dịch, khoản vay và Fund Catalog. Apps Script tiếp tục là nơi ghi có thẩm quyền và sync lại cache sau ghi.

## 4. Checkpoint gần nhất đã hoàn thành

### E1.4 — Controlled cutover sang Supabase report cache

Trạng thái: **DONE ngày 2026-07-19; production dùng `REPORT_CACHE_MODE=supabase`, no-append và authenticated stabilization đều PASS**.

- Bổ sung wrapper `supabase`, cutover batch có realtime guard/no-append gate/tự rollback `dual` và audit hậu trigger read-only. Gate source đạt 296/296 test, lint, typecheck, Next build và `git diff --check`.
- Trước cutover, `SYS_ReportCache` đã tăng đến dòng 198.900. Batch `dataVersion=1784425969331` đồng bộ đủ 4/4 bundle và giữ dòng Sheet trước/sau đúng 198.900, tăng 0; mode chuyển thành `supabase` với `writeSheet=false`, `writeSupabase=true`.
- Audit sau nhiều vòng trigger và sau force refresh preview/production tiếp tục giữ dòng 198.900. Supabase đủ bốn row hiện hành 05/2026, 06/2026, 07/2026, `Tất cả` với metadata `v13`/version/hash hợp lệ.
- Apps Script candidate riêng `AKfycbz1Yb_1LrA-absjC9-3S07Gyy1HLLB85j4eQatEaW01gYMe077L_b03E-48OA2SDRbKWQ` được tạo ở `@289`. Production deployment ID hiện hữu `AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw` đã update lên corrected `@290`; rollback cùng-ID là `@282`.
- Authenticated preview và production PASS cho latest/05/06/07/`Tất cả`, đọc đúng Supabase cache. Initial production Report khoảng 2,1 giây; đổi kỳ khoảng 4 giây. Force refresh `Tất cả` qua Apps Script `@290` PASS khoảng 40,6 giây preview và 41,6 giây production, hiển thị fallback rõ ràng.
- Production health 200 với `cacheVersion=v13`, `reportCacheMode=supabase`; không có browser error hoặc HTTP 500. Preview alias/env đã phục hồi nguyên trạng sau một deployment thử thiếu server secret; không secret nào bị xoay hoặc lộ.
- Source/docs đã push ở commit `907f707`. `SYS_ReportCache` chưa compact/xóa; cleanup thuộc checkpoint riêng.

### E1.3 — Dual-mode preview và parity

Trạng thái: **DONE ngày 2026-07-19; retry có guard và authenticated preview đều PASS, runtime giữ `dual` chờ cutover riêng**.

- Lần chạy đầu bị realtime trigger chồng lấn và đã rollback an toàn về `sheet`. Retry được phê duyệt bổ sung guard dùng Script Property/Script Cache cùng Script Lock ngắn; wrapper chờ tick cũ kết thúc và tick mới tự skip trong cửa sổ parity.
- Baseline retry của `SYS_ReportCache` tăng đúng từ 196.937 lên 196.976: 39 dòng cùng `dataVersion=1784398414278`, mỗi tháng 05/2026, 06/2026, 07/2026 có 13 dòng và không có version xen ngang.
- Supabase có đủ 4/4 exact-version row `cache_version=v13`. Audit bounded/normalized xác nhận hash payload khớp Sheet cho ba tháng và `Tất cả`, mỗi payload có 13 dòng chi tiết.
- Authenticated preview Report PASS cho latest 07/2026, 05/2026, 06/2026 và `Tất cả`; mọi kỳ đọc từ Supabase API cache, dữ liệu phân biệt đúng. Đổi kỳ hoàn tất khoảng 1–3,6 giây.
- Một lần force refresh `Tất cả` hoàn tất khoảng 42 giây, hiển thị rõ `Đang đọc fallback từ Apps Script`, giữ đủ dữ liệu tổng hợp, không có lỗi console hoặc dấu hiệu HTTP 500.
- Source đã push, Apps Script version bất biến `@288` đã tạo; gate đạt 294/294 test, lint, typecheck, Next build và `git diff --check`. Production endpoint vẫn `@282`, Vercel alias/env không đổi, `SYS_ReportCache` chưa compact/xóa và mode hiện giữ `dual`.

### E1.2 — Apps Script batch/upsert và dual mode

Trạng thái: **DONE ngày 2026-07-19; code/candidate hoàn tất, production vẫn `sheet` trên Apps Script `@282`**.

- `SupabaseReportCacheRepository.gs` đọc `payload.overview.details` theo exact `spreadsheet_id`, `cache_version`, `source_data_version`; loại `Tất cả`/dashboard khỏi map tháng và upsert full bundle với SHA-256 hex vào khóa `(spreadsheet_id, report_month)`.
- `REPORT_CACHE_MODE` đã nối vào runtime: `sheet` đọc/ghi Sheet; `dual` đọc/ghi Sheet và shadow-upsert Supabase; `supabase` ưu tiên Supabase, fallback Sheet/live compute, không append `SYS_ReportCache`.
- Supabase read/write lỗi không làm mất live report nếu Google Sheet còn đọc được. Cache chi tiết trong memory được scope theo `(spreadsheetId, dataVersion)` để một execution không quét Sheet/Supabase lặp lại.
- `syncAllReportBundles()` invalidation đúng một lần, dựng `Tất cả` trước để batch-compute mọi tháng thiếu, rồi upsert từng tháng và `Tất cả` với cùng một `dataVersion`; report tables và detail matrices được tái sử dụng trong cùng execution.
- Source đã force-push Apps Script; candidate đã chốt `AKfycbywZZpzPea0EwdfcEG7OdwhnrMWXeEGI7f-JWnMADGaj1d04-JMrwXIvtZNnswI8-mwww` version `@286` smoke health 200 với `cacheVersion=v13`, `reportCacheMode=sheet`. Candidate `@285` được tạo trước correction call-site cuối và không được sử dụng.
- Gate đạt 291/291 test, lint, typecheck, Next build và `git diff --check`. Không chạy report sync/force refresh, không đổi Script Property, Vercel env/alias hoặc Apps Script production URL; không compact `SYS_ReportCache`.

### E1.1 — Nền tảng chuyển `SYS_ReportCache` sang Supabase

Trạng thái: **DONE ngày 2026-07-18; migration production đã apply, runtime vẫn giữ chế độ Sheet**.

- E1.0 audit read-only xác nhận `SYS_ReportCache` có 196.442 dòng dữ liệu và 6.832 `dataVersion`; chỉ 39 dòng hiện hành, 196.403 dòng stale (99,98%). Repository hiện quét khoảng 1.964.420 ô cho mỗi lần đọc cache trước khi lọc.
- Supabase `report_bundles` đã sẵn có đúng mô hình một row trên `(spreadsheet_id, report_month)`. Sau E1.1, bảng production có khoảng 5 row và tổng dung lượng khoảng 272 kB theo `supabase inspect db table-stats`.
- Migration additive `010_report_cache_cutover_foundation.sql` đã được apply production và remote migration history có đủ `001–010`. Migration thêm ba cột nullable `cache_version`, `source_data_version`, `details_hash`, constraint SHA-256 và index lookup; không update/delete dữ liệu, không đổi primary key.
- `ReportCacheMode.gs` định nghĩa `REPORT_CACHE_MODE=sheet|dual|supabase`; giá trị trống hoặc sai fallback `sheet`. E1.1 chưa nối flag vào repository và chưa đổi production khỏi Apps Script `@282`.
- Source đã force-push lên Apps Script và candidate riêng `AKfycbxRRwRBwonYDCdgrnX5dTjLqHePCMfDOKQrNStjz2sE9KC4Kc2Lg72yqX6B361Dwccbxg` version `@284` được tạo; smoke health trả 200 với `cacheVersion=v13`, `reportCacheMode=sheet`. Version `@283` tạo trước force-push không deploy/không sử dụng.
- `SYS_ReportCache` chưa compact/xóa và vẫn là cache runtime production hiện hành. Gate source đạt 288/288 test, lint, typecheck, Next build và `git diff --check`.
- Rollback schema không cần drop cột vì migration additive; rollback runtime là `REPORT_CACHE_MODE=sheet`.

### Phase C3 — Golden-master parity

Trạng thái: **DONE ngày 2026-07-16; người dùng chấp thuận production stabilization và cho phép mở checkpoint D1 riêng**.

- Production `dongbac.vercel.app` đang trỏ interaction correction `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`; correction trước và C2 recovery vẫn giữ nguyên, chưa xóa.
- Candidate parity sai đã bị loại khỏi nhánh triển khai mới.
- Golden source: production C2 sau hydrate và tree `73a0ede`.
- Baseline/matrix: `docs/quality/C3_GOLDEN_MASTER.md`, `docs/quality/C3_PARITY_MATRIX.md`.
- Dashboard correction `dpl_6gdxkLwGnXperukyRtre3iqCTmuz` đã được người dùng phê duyệt; Login/Auth, Shell/Nav và Dashboard là `USER_APPROVED`.
- Người dùng đã phê duyệt Report và cho phép tiếp tục checkpoint ngày 2026-07-14; Report là `USER_APPROVED`.
- Người dùng đã phê duyệt tiếp tục checkpoint sau khi kiểm tra correction Manage/Entry; hai surface này được khóa `USER_APPROVED`. Người dùng vẫn ghi nhận nhiều lỗi UI/UX ở Manage và Catalog; đây là UI debt sẽ xử lý ở pha sau, không được hiểu là C2 visual đã hoàn hảo.
- Người dùng đã kiểm tra Catalog và phê duyệt tiếp tục hoàn thiện migration ngày 2026-07-14; Catalog được nâng `USER_APPROVED` cho gate migration với UI debt nói trên.
- Preview Report correction đã duyệt trước cut-forward từng là READY `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`; candidate dùng Production environment với `--skip-domain` để nhận đủ server env `sensitive`, rồi chính deployment bất biến đó được gán production. Alias preview hiện đã chuyển sang Shell/Nav correction mới ghi ở cuối mục này.
- Người dùng phát hiện Manage không hiển thị dù route 200; nguyên nhân là root `.view` thiếu `.active`. Correction thêm state hiển thị, lazy-load catalog Entry khỏi critical path, loading shimmer C2 và targeted prefetch theo intent.
- Catalog port lại đúng C2 với chín tab, filter nhân sự/chủ xe, bảng/pagination, modal add/edit/delete, cột chủ xe và mapping clear-only cho hai view ảo `DM_ThamSo`; không đổi Sheet/schema/cột/công thức.
- Cashflow port lại bốn surface C2: Tổng quan/báo cáo/export, Danh sách thu chi với quick/custom date/search/pagination/pending jobs, Khoản vay với reconciliation/filter/history và Fund Catalog inline; các form dùng drawer C2. Queue/idempotency, row identity, native-range bounds và Apps Script authoritative writes được giữ nguyên; không đổi Sheet/schema/cột/công thức.
- Correction ngày 2026-07-14 tách class mở menu shell khỏi class popup nghiệp vụ, đưa Cashflow drawer và Manage Entry/edit modal lên `document.body`, khóa bottom navigation khi modal mở, đồng thời bổ sung full-viewport/safe-area/independent-scroll cho form mobile. Việc bấm `Nhập mới` không còn kích hoạt menu trái; không redesign font, màu hoặc hierarchy C2.
- Người dùng từ chối presentation/interaction Entry của correction đầu vì không vuốt được và icon lộn xộn. Correction kế tiếp phục hồi trực tiếp contract DOM C2: `#rows` là vùng cuộn dọc duy nhất; bốn action Cập nhật/Nhân bản/Thêm dòng/Đóng dùng đúng SVG và ID C2 trong cùng submit bar; bỏ floating close và grid mobile tự chế. UI/UX skill chỉ được dùng để kiểm tra touch/scroll/icon consistency, không thay style C2.
- Sau khi người dùng tiếp tục phát hiện popup `Quỹ > Danh mục thu chi > Nhập mới` không vuốt được, toàn bộ overlay nghiệp vụ đã được audit thay vì vá riêng một màn hình: bốn Cashflow drawer, Manage Entry/edit và Catalog add/edit. Mỗi overlay chỉ còn một vùng pan-y có momentum, header/footer không co, action bar chừa safe-area; bảng ngang bên trong không còn tranh quyền cuộn dọc. Catalog modal được portal ra `document.body` và khóa bottom navigation giống Manage/Cashflow. Rule full-height chỉ áp dụng mobile, không phá drawer nổi desktop.
- Người dùng kiểm tra thực tế ngày 2026-07-15 và xác nhận popup thêm giao dịch vẫn không vuốt được. Nguyên nhân chính xác là selector React `.cashflow-c2 { display:block }` nằm sau golden CSS đã ghi đè `display:flex` của `.fund-detail-drawer`; do đó drawer cắt phần form dài thay vì tạo scroll container. Correction scope `display:block` riêng cho `#cashflowView`, ép body-level Cashflow drawer trở lại column flex và dùng `flex-basis:0`/`height:0` cho vùng form để iOS Safari có chiều cao cuộn hữu hạn. Regression test mới cấm selector generic tái xuất hiện và khóa cascade drawer/body.
- Người dùng đã retest và xác nhận form Cashflow vuốt được ngày 2026-07-15; C3.5 được khóa `USER_APPROVED` và cho phép chuyển C3.6.
- Settings/Observability C3.6 đã bỏ presentation `b7-*`, phục hồi root `.view active`, card/form/table tài khoản, password toggle riêng, temporary password, nhóm icon audit SVG và bốn section sync/queue/audit đúng golden tree `73a0ede`. Own-password giữ cho mọi role, account administration chỉ admin; shareholder bị chặn Observability ở client và server. Initial load chỉ gọi sync status/write queue; quick/deep/all/report audit và retry chỉ chạy sau thao tác chủ động.
- Trước phê duyệt, gate C3.6 đạt 278/278 test, lint, typecheck, build, diff check; deployment-authenticated root 200, session không cookie 401 và API health 200. Browser automation bị Vercel Deployment Protection chặn trước app nên authenticated visual gate do người dùng trực tiếp xác nhận.
- Người dùng phê duyệt Settings/Observability và yêu cầu chuyển checkpoint ngày 2026-07-15; toàn bộ parity matrix được khóa `USER_APPROVED`. Controlled cut-forward dùng đúng deployment preview bất biến, không rebuild giữa phê duyệt và production. Post-cutover smoke xác nhận các route chính, favicon và manifest 200; session không cookie 401, health 200 và không có log 5xx. Apps Script/data/schema không thay đổi.
- Sau cut-forward, người dùng phát hiện Report mất ba dòng tổng/profit, mobile empty state và tốc độ chuyển menu/load bảng chậm hơn C2. Production được rollback ngay. Correction phục hồi detail rows, khóa `latest` vào tháng nghiệp vụ mới nhất thay vì row sync gần nhất, bỏ filter stale và loại các round-trip auth/API/prefetch trùng; không đổi Sheet, schema hoặc công thức.
- Gate correction: 282/282 test, lint, typecheck, build, diff check; candidate root 200, session 401, health 200. Authenticated data/visual/performance vẫn cần người dùng kiểm tra trên preview.
- Người dùng phê duyệt correction và yêu cầu chuyển checkpoint ngày 2026-07-15; Report trở lại `USER_APPROVED`. Gate được chạy lại trên commit đã duyệt và tiếp tục đạt 282/282 test, lint, typecheck, build, diff check. Controlled cut-forward chỉ đổi alias production sang đúng deployment preview bất biến, không rebuild.
- Post-cutover smoke xác nhận root, Dashboard, Report, Manage, Catalog, Cashflow, Settings, Observability, favicon và manifest 200; session không cookie 401, health 200 và không có log 5xx trong cửa sổ kiểm tra. Apps Script/data/schema không thay đổi; D1 vẫn blocked.
- Sau cut-forward lần hai, người dùng ghi nhận chuyển menu vẫn khựng và các thao tác thiếu toast. Correction interaction feedback giữ nguyên presentation C2, thêm active/pending state ngay khi chạm menu, progress route, intent-prefetch cho touch và một toast viewport toàn cục cho refresh/export/CRUD/submit/audit/account actions. Candidate `dpl_9HKgcJQZoZJcj1co5xd8sTdemFKq` đang ở `https://vantaidongbac-c3-preview.vercel.app`; production vẫn giữ `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`. Gate đạt 283/283 test, lint, typecheck, build; root 200, session không cookie 401, health 200. Shell/Nav tạm là `TECH_PASS`, chờ authenticated mobile/desktop retest; không tuyên bố giảm network/data latency nếu chưa đo trong phiên thật.
- User retest ngày 2026-07-16 phát hiện candidate trên bị progress chạy vô hạn, bottom item active nhạt, mất auto-hide/show khi cuộn và còn khoảng hở dưới nav. Root cause progress/màu là `trailingSlash:true`: pending `/dashboard` không bằng pathname `/dashboard/`, khiến pending không kết thúc và button bị disabled/opacity 0.5. Correction mới chuẩn hóa route trước so sánh, có timeout fail-safe, bỏ native disabled khỏi active nav; port lại chính xác threshold/near-top/near-bottom/scroll-direction C2 bằng passive listener + `requestAnimationFrame`; hạ bottom offset từ `12px + safe-area` xuống sát safe-area hợp lệ. Candidate hiện tại `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF` READY trên preview; production vẫn `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`. Gate đạt 284/284 test, lint, typecheck, build; root 200, session 401, health 200. Shell/Nav vẫn `TECH_PASS`, chờ user retest.
- Authenticated retest mobile/desktop ngày 2026-07-16 xác nhận progress kết thúc sau route, active item không disabled/nhạt, bottom nav tự ẩn/hiện đúng hướng cuộn, nằm sát safe-area và toast refresh chuyển loading sang success rồi tự ẩn. Người dùng phê duyệt promote; controlled cut-forward chỉ đổi alias production sang đúng deployment bất biến `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`, không rebuild. Post-cutover smoke xác nhận root, Dashboard, Report, Manage, Catalog, Cashflow, Settings, Observability, favicon và `/manifest.json` 200; session không cookie 401, health 200 và không có HTTP 500. Log vẫn có warning `DEP0169 url.parse()` trên request health 200 đã biết. Apps Script/data/schema không thay đổi; D1 tiếp tục blocked.
- Authenticated production stabilization retest ngày 2026-07-16 xác nhận Dashboard/Report route cache khoảng 0,45–0,50 giây, mobile nav/progress/toast đúng contract, Report có đủ bốn bảng và ba dòng total/profit, fallback Apps Script hoạt động; force refresh Dashboard mất khoảng 20 giây. Không có browser error hoặc HTTP 500. Người dùng chấp thuận đóng C3 và mở D1 bằng phê duyệt riêng.
- Thứ tự gate: Shell/Login → Dashboard → Report → Manage/Entry → Catalog → Cashflow → Settings/Observability.
- Mỗi module phải được người dùng duyệt riêng; D1 blocked.

### Attempt D1 — đã rollback

Trạng thái: **BLOCKED/ROLLED BACK**.

- Audit consumer/call site trước khi xóa; giữ Apps Script API, integration, worker, trigger, cache/queue và contract dữ liệu.
- Xóa legacy HtmlService presentation, template/client/style fragments, React islands, DOM bridge, feature flags, compatibility bundles và build pipeline tương ứng.
- Apps Script API-only deploy ở version `@282`, deployment `AKfycbwCew3wyCiZEZq66i5m7JGhDuAZouMJHv61JmjfeA7TAbGCCUxATntR9TjkO6TUlNUtkw`.
- Vercel production `dpl_8AdSfrkz764MjBwygZa7zr7ZM8d9`, alias `https://dongbac.vercel.app`.
- Verification đạt 265/265 test, lint, typecheck, build, `git diff --check`; root/API health và các route chính đạt 200 sau redirect chuẩn hóa, path legacy đạt 404, không có HTTP 500 trong log kiểm tra.
- Recovery C2 `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`, legacy C1 và Apps Script `@281` vẫn được giữ làm rollback.
- Không migration/thay đổi Google Sheet hoặc Supabase schema, không chạy business/account write production.

### Checkpoint lịch sử: C2 — Production stabilization và recovery regression

Trạng thái: **DONE ngày 2026-07-13; production giữ presentation legacy đã được người dùng xác nhận sau recovery**.

Phạm vi hoàn thành:

- sửa regression `/favicon.ico` bằng redirect 307 cùng-origin tới PNG hiện hữu; asset cuối trả HTTP 200;
- khôi phục Apps Script backend bị HTTP 403 bằng deployment mới từ đúng version bất biến `@281` sau khi owner cấp lại quyền; không push hoặc sửa Apps Script source;
- cập nhật Vercel `APPS_SCRIPT_URL` và redeploy Next production; root, health, authenticated session, Dashboard, sync status, queue và report audit đều trả HTTP 200;
- audit tháng `07/2026` xác nhận Supabase report cache khớp live Google Sheet bằng cùng hash; queue có 12 job gần nhất và không có job active;
- xác nhận legacy deployment `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS` vẫn READY tại `https://vantaidongbac-legacy.vercel.app`;
- không thay đổi Google Sheet, công thức, Supabase schema/dữ liệu và không chạy account/business write, retry hoặc worker.

Verification C2:

- `npm test`: 356/356 pass; `npm run lint`, `npm run typecheck` và `npm run build:next-accounts` pass;
- branch `codex/next-production-stabilization-c2`;
- Next production deployment `dpl_HtiB9PFutzyXhoUcKJPo4hQvMMJu`, alias `https://dongbac.vercel.app`, trạng thái READY;
- Apps Script recovery deployment `AKfycbzO8puBHqpuoA9_eYPROuNGoISJM6bI9HT53xigZY_xK-BmQdcRhd_rje4qGFGVPbF3Mg`, cùng code version `@281`;
- admin authenticated HTTP smoke đạt; Dashboard `07/2026` trả doanh thu `270.513.180`, dữ liệu chuyến gần nhất ngày `04/07/2026`, Supabase cache được cập nhật và audit Sheet đạt;
- unauthenticated `/api/session/` trả 401 đúng contract; log không có 5xx trong smoke, warning `DEP0169` vẫn xuất hiện trên request 200.

Sau cutover, người dùng phát hiện Next shell thay đổi UI/UX ngoài phạm vi migration đã duyệt và Report chậm/không tải. Recovery đã thực hiện:

- đưa giao diện legacy đã duyệt trở lại production trong cùng Next deployment; giữ Next API và module routes làm preview, không xóa source migration;
- tắt Next Link prefetch cho menu dữ liệu nặng để tránh đồng thời gọi Dashboard, Report, Manage và các route khác;
- sửa truy vấn `getReportBundle(month=latest)` để lấy bundle mới nhất theo workbook thay vì tìm literal `report_month=latest` rồi fallback Apps Script;
- thêm rewrite tương thích `/public/static/* -> /static/*` để logo và bundle Accounts/Report/Cashflow trả 200 dưới Next runtime;
- production recovery deployment `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`, alias `https://dongbac.vercel.app`; deployment trước recovery `dpl_5qua6YTqNS1GPkWE1YGP1f1v9ouU` được giữ làm rollback;
- HTTP smoke production: root legacy 200, asset chính 200, health 200; authenticated Report `latest` trả 200 với `apiCached=true`, `supabaseCached=true` trong khoảng 2,8 giây trên deployment recovery;
- người dùng đã xác nhận giao diện cũ quay trở lại trong browser production ngày 2026-07-13;
- verification đóng checkpoint chạy lại `npm test` 359/359, lint, typecheck và build pass; deployment recovery vẫn READY, root/legacy shell/favicon/health trả HTTP 200 sau redirect và log 30 phút không có HTTP 500;
- C2 được đóng theo production posture an toàn là legacy presentation trên Next runtime/API. Visual parity và cut forward Next được tách thành checkpoint C3 riêng để không trộn recovery với một lần đổi presentation mới.

Checkpoint nền tảng trước đó A2 đã hoàn thành ngày 2026-07-12; rollback deployment là `dpl_DuFhuaRHL9oU2YWsK93FhYuwiQBp`.

Checkpoint runtime gần nhất trước đó:

- Phase 6 chỉ tạo frontend Next.js cho Report tại `/next-accounts/reports/`.
- Dùng API `getReportBundle` hiện có; không tạo API mới.
- Pass 296/296 test và full build.
- Commit code `c3fc150`, checkpoint `32437d6`.
- Vercel production deployment `dpl_y3oddZTTtfmFewyQyTwYjwTnRDtV`.
- Apps Script production vẫn ở deployment `@281`.
- Không migration hoặc thay đổi Google Sheet.

Chương trình refactor Step 1–36 trong `REFACTOR_PLAN.md` đã hoàn thành. File đó là historical plan, không còn quyết định bước tiếp theo.

## 5. Checkpoint hiện tại

### E1.5 — Archive/compact `SYS_ReportCache`

Trạng thái: **IN PROGRESS ngày 2026-07-19; dry-run, full-workbook backup và prepared snapshot đã PASS; destructive pass chưa được phê duyệt/chưa chạy**.

Trạng thái chuẩn bị:

- Full-workbook backup riêng đã tạo: `BACKUP E1.5 - VanTaiDongBac_2026 - before SYS_ReportCache compaction - 2026-07-19`, file ID `132EMVW5MI_jxyTtVVuPoXfcXIkM1-v7YVfINC0xV164`. Metadata xác nhận backup giữ nguyên hidden sheet ID `1474417029`, 198.900 hàng và 26 cột vật lý.
- Apps Script version bất biến `@291` chứa migration riêng `ReportCacheCompactionMigration.gs`; production web-app deployment vẫn giữ `@290`, URL/alias/Vercel env không đổi.
- Live dry-run PASS ở mode `supabase`: header A:J đúng contract, last column có dữ liệu là J, không có formula trong batch giữ, dòng cuối vẫn 198.900. Batch giữ là 39 dòng `v13`, `dataVersion=1784425021715`, đúng 13 dòng cho mỗi 05/2026, 06/2026, 07/2026; fingerprint `3b4036b626f740526638c5d0a5c4184d4dc7fece03d35569f28efbf70196cd75`.
- Prepared snapshot đã lưu cùng backup ID và tự xóa mọi approval cũ. Kế hoạch destructive sẽ archive/remove 198.860 dòng stale, giữ header + 39 dòng rollback, đưa sheet về 40 dòng vật lý.
- Migration destructive bị khóa bằng bốn gate: mode phải còn `supabase`, backup riêng phải tồn tại, live row/version/fingerprint phải khớp prepared snapshot và phải có one-shot approval riêng. Approval tự bị xóa trong `finally`.
- Gate source hiện đạt 301/301 test, lint, typecheck, Next build và `git diff --check`.
- Chưa gọi `approveReportCacheCompactionForMigration()` hoặc `runReportCacheCompactionForMigration()`; Google Sheet nguồn chưa bị sửa/xóa dòng. Cần người dùng phê duyệt destructive pass riêng trước khi tiếp tục; sau compact phải chạy post-migration Sheet/Supabase/Report/fallback smoke rồi mới đóng E1.5.

## 6. Mục tiêu kiến trúc dài hạn

Definition of Done của chương trình Next.js:

1. `/` được render bởi Next.js App Router.
2. Next.js là presentation layer duy nhất.
3. Server Components dùng cho layout, auth guard và initial read khi phù hợp.
4. Client Components chỉ dùng cho interaction/browser state.
5. Mọi module gọi API qua contract thống nhất; không dùng DOM bridge hoặc frontend global legacy.
6. Authentication và RBAC được enforce ở Vercel/API và Apps Script boundary phù hợp.
7. Workbook/year context rõ ràng cho mọi request cần dữ liệu Sheet.
8. Apps Script không còn render HTML sau khi migration hoàn tất; chỉ làm API, integration, worker và sync.
9. Google Sheets tiếp tục là source of truth cho đến khi có quyết định kiến trúc/migration riêng.
10. Supabase tiếp tục là Auth/read model/cache/queue; không âm thầm trở thành source of truth.
11. Legacy frontend được giữ làm rollback trong giai đoạn cutover, sau đó xóa bằng checkpoint riêng.
12. Build, lint, type-check, tests, RBAC và responsive QA trở thành quality gates bắt buộc.

Dependency direction mục tiêu:

```text
Browser / Next.js UI
        ↓
Next.js server / Vercel API boundary
        ↓
Apps Script application API
        ↓
Domain services
        ↓
Google Sheet adapters / Supabase repositories
        ↓
Google Sheets source of truth / Supabase read model, cache, queue
```

Roadmap và tiêu chí hoàn thành từng checkpoint thuộc `NEXTJS_MIGRATION_PLAN.md`. Kiến trúc đích tổng quát thuộc `TARGET_ARCHITECTURE.md`.

## 7. Rủi ro và điều kiện trước checkpoint tiếp theo

1. **Role coverage**: admin đã smoke production; operator/shareholder có contract/unit gate nhưng chưa có representative production smoke.
2. **Rollback**: không xóa recovery C2, legacy C1/alias hoặc Apps Script `@281` cho đến khi người dùng phê duyệt kết thúc retention.
3. **PWA/cache cũ**: tiếp tục theo dõi client đã cài PWA/service worker legacy và cache path cũ.
4. **Runtime warning**: Vercel Node 24 có thể ghi `DEP0169 url.parse()` trên `/api/app/` dù HTTP 200; source project không có call site trực tiếp.
5. **Dữ liệu**: mọi thay đổi Google Sheet/Supabase schema phải là migration riêng được phê duyệt; Google Sheets vẫn là source of truth.
6. **Golden runtime**: template tĩnh không đủ; phải port cả client runtime và data-selection semantics.
7. **Visual approval**: HTTP/DOM/unit test không thay thế ảnh authenticated và xác nhận trực tiếp của người dùng.
8. **CSS dependency/cascade**: mọi surface tiếp theo phải audit font/script/asset thật, DOM wrapper và selector rò rỉ từ shared CSS; copy stylesheet đơn thuần không đủ.
9. **Report cache parity**: hash phải loại field volatile và đối chiếu ít nhất 05/2026, 06/2026, 07/2026, `Tất cả` trước khi đổi mode.
10. **Version amplification**: batch sync phải dùng một `source_data_version`; không gọi force refresh lặp làm tăng version cho từng tháng.
11. **Rollback**: `REPORT_CACHE_MODE=sheet` phải hoạt động ngay cả khi Supabase thiếu metadata/lỗi; chưa xóa cache Sheet ở E1.2.
12. **Production migration**: migration `010` đã apply; không sửa file migration đã chạy. Mọi schema correction phải là migration `011+`.
13. **Realtime overlap**: guard E1.3 đã ngăn tick mới khởi động và chờ tick cũ kết thúc trước batch; retry chứng minh không có version xen ngang. Phải giữ regression test cho protocol này và không chạy parity helper song song từ nhiều editor session.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline hiện tại:

- Production `/` chạy Next.js App Router D1 với Apps Script API-only deployment ID cũ đã update lên `@290` và trả 200.
- Production deployment D1: `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx`; rollback C3 `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`; rollback correction trước `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`; rollback C2 `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`; Apps Script recovery `@281`.
- Dashboard golden 07/2026: 270.513.180 / 94.863.960 / 175.649.220 / 341.770.935 / -166.121.715.
- Nhánh triển khai: `codex/c3-golden-master`, base `a5e29bf`.
- C3 interaction correction `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF` vẫn READY làm rollback; toàn bộ mười surface là `USER_APPROVED`, C3 đã đóng.
- Gate cut-forward: 284/284 test, lint, typecheck, build, `git diff --check`; các route chính/PWA 200, session unauthenticated 401, API health 200 và không có HTTP 500 sau smoke.
- D1 `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx` vẫn READY tại production; Apps Script deployment ID hiện ở E1.4 `@290`, rollback code `@282`.
- Supabase production migration history có đủ `001–010`; `report_bundles` giữ primary key `(spreadsheet_id, report_month)` và metadata E1.1 nullable.
- Runtime production dùng cùng Apps Script endpoint đã update `@290`; Script Property là `supabase`. `SYS_ReportCache` dừng ở dòng 198.900 qua batch và nhiều trigger, chưa compact/xóa. Source migration E1.5 đã chốt ở Apps Script `@291` nhưng không update deployment runtime.
- Apps Script candidate E1.2 `@286` READY/smoke health 200 ở mode `sheet`; `@285` bị loại, chưa dùng candidate cho production hoặc chạy dual-mode sync.
- E1.4 đã DONE: technical cutover, no-append, post-trigger, preview và production authenticated stabilization đều PASS. E1.5 dry-run/backup/prepared snapshot đã PASS; destructive compact 198.860 dòng chưa được phê duyệt/chưa chạy.

Mọi checkpoint mới phải chạy lại verification phù hợp và không mặc định baseline này còn đúng nếu source/deployment thay đổi.

## 9. Quy tắc cập nhật handoff

Chỉ cập nhật file này khi một trong các trạng thái sau thay đổi:

- checkpoint hoàn thành hoặc bị rollback;
- checkpoint tiếp theo thay đổi;
- production architecture/deployment thay đổi;
- Definition of Done hoặc quyết định source of truth thay đổi;
- xuất hiện blocker/risk ảnh hưởng trực tiếp bước tiếp theo.

Không ghi nhật ký từng commit hoặc toàn bộ lịch sử step vào đây. Lịch sử thuộc Git, `CHANGELOG.md`, `REFACTOR_PLAN.md` và tài liệu historical tương ứng.

## 10. Router tài liệu chuyên biệt

| Tác vụ | Đọc thêm |
| --- | --- |
| Next.js roadmap/checkpoint | `NEXTJS_MIGRATION_PLAN.md`, `TARGET_ARCHITECTURE.md` |
| Frontend/architecture hiện tại | `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/MODULE_MAP.md` |
| Luồng request/data | `docs/architecture/DATA_FLOWS.md` |
| API/RBAC/Auth | `docs/contracts/API_CONTRACTS.md`, `docs/contracts/RBAC_MATRIX.md` |
| Google Sheet/schema/formula | `PROJECT_SCHEMA.md`, `docs/contracts/SPREADSHEET_CONTRACTS.md` |
| Supabase/cache/queue | `SUPABASE_SCHEMA.md`, migrations, `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md` |
| Thu chi bound script | `docs/legacy/THU_CHI_BOUND_SCRIPT.md` và source snapshot |
| Test/risk | `docs/quality/TEST_STRATEGY.md`, `docs/quality/KNOWN_RISKS.md` |
| Deploy/rollback | `WORKFLOW.md`, `ROLLBACK.md`, `SUPABASE_SETUP.md` khi cần |
| Lịch sử refactor 1–36 | `REFACTOR_PLAN.md`, `AUDIT_REPORT.md`, Git history |

## 11. Trạng thái tài liệu

- Loại: `CURRENT` living handoff.
- Owner: trạng thái hiện tại, checkpoint gần nhất và checkpoint tiếp theo.
- Không sở hữu: API/schema/module contract chi tiết hoặc lịch sử đầy đủ.
- Nguồn kiểm chứng: source, tests, build output, deployment checkpoint và tài liệu contract.
- Ngày xác nhận: 2026-07-18.
- Cập nhật khi: các điều kiện tại mục 9 thay đổi.
