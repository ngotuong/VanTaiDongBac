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
  └─ dongbac.vercel.app        -> C2 recovery presentation (production)
  └─ C3 preview                -> Next.js App Router (đang triển khai theo golden master)
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
- Production alias đã rollback về C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`.
- Root layout server-render auth/workbook context; chưa đăng nhập render LoginGate cùng-origin, đăng nhập tạo HttpOnly cookie qua `/api/session`.
- Các route Next độc lập được giữ làm nền kỹ thuật nhưng chưa được chấp nhận làm production presentation.
- Nhánh C3 mới `codex/c3-golden-master` bắt đầu từ nền Next sạch `a5e29bf`; nguồn C2 tại tree `73a0ede` được dùng làm golden reference, không khôi phục DOM bridge vào production.
- Apps Script production vẫn dùng recovery `@281`; D1/API-only `@282` bị khóa.

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

### Phase C3 — Golden-master parity

Trạng thái: **IN PROGRESS ngày 2026-07-14; Shell/Login/Dashboard/Report/Manage/Entry/Catalog đã USER_APPROVED cho mục tiêu migration, Cashflow đạt TECH_PASS và đang chờ duyệt**.

- Production giữ C2 recovery, không cut-forward.
- Candidate parity sai đã bị loại khỏi nhánh triển khai mới.
- Golden source: production C2 sau hydrate và tree `73a0ede`.
- Baseline/matrix: `docs/quality/C3_GOLDEN_MASTER.md`, `docs/quality/C3_PARITY_MATRIX.md`.
- Dashboard correction `dpl_6gdxkLwGnXperukyRtre3iqCTmuz` đã được người dùng phê duyệt; Login/Auth, Shell/Nav và Dashboard là `USER_APPROVED`.
- Người dùng đã phê duyệt Report và cho phép tiếp tục checkpoint ngày 2026-07-14; Report là `USER_APPROVED`.
- Người dùng đã phê duyệt tiếp tục checkpoint sau khi kiểm tra correction Manage/Entry; hai surface này được khóa `USER_APPROVED`. Người dùng vẫn ghi nhận nhiều lỗi UI/UX ở Manage và Catalog; đây là UI debt sẽ xử lý ở pha sau, không được hiểu là C2 visual đã hoàn hảo.
- Người dùng đã kiểm tra Catalog và phê duyệt tiếp tục hoàn thiện migration ngày 2026-07-14; Catalog được nâng `USER_APPROVED` cho gate migration với UI debt nói trên.
- Preview overlay correction toàn diện: `https://vantaidongbac-c3-preview.vercel.app`, READY `dpl_Fi2JXxP4kJPbYBaNvZkZ1i1ktUX3`. Candidate dùng Production environment với `--skip-domain` để nhận đủ server env `sensitive`; không promote production.
- Người dùng phát hiện Manage không hiển thị dù route 200; nguyên nhân là root `.view` thiếu `.active`. Correction thêm state hiển thị, lazy-load catalog Entry khỏi critical path, loading shimmer C2 và targeted prefetch theo intent.
- Catalog port lại đúng C2 với chín tab, filter nhân sự/chủ xe, bảng/pagination, modal add/edit/delete, cột chủ xe và mapping clear-only cho hai view ảo `DM_ThamSo`; không đổi Sheet/schema/cột/công thức.
- Cashflow port lại bốn surface C2: Tổng quan/báo cáo/export, Danh sách thu chi với quick/custom date/search/pagination/pending jobs, Khoản vay với reconciliation/filter/history và Fund Catalog inline; các form dùng drawer C2. Queue/idempotency, row identity, native-range bounds và Apps Script authoritative writes được giữ nguyên; không đổi Sheet/schema/cột/công thức.
- Correction ngày 2026-07-14 tách class mở menu shell khỏi class popup nghiệp vụ, đưa Cashflow drawer và Manage Entry/edit modal lên `document.body`, khóa bottom navigation khi modal mở, đồng thời bổ sung full-viewport/safe-area/independent-scroll cho form mobile. Việc bấm `Nhập mới` không còn kích hoạt menu trái; không redesign font, màu hoặc hierarchy C2.
- Người dùng từ chối presentation/interaction Entry của correction đầu vì không vuốt được và icon lộn xộn. Correction kế tiếp phục hồi trực tiếp contract DOM C2: `#rows` là vùng cuộn dọc duy nhất; bốn action Cập nhật/Nhân bản/Thêm dòng/Đóng dùng đúng SVG và ID C2 trong cùng submit bar; bỏ floating close và grid mobile tự chế. UI/UX skill chỉ được dùng để kiểm tra touch/scroll/icon consistency, không thay style C2.
- Sau khi người dùng tiếp tục phát hiện popup `Quỹ > Danh mục thu chi > Nhập mới` không vuốt được, toàn bộ overlay nghiệp vụ đã được audit thay vì vá riêng một màn hình: bốn Cashflow drawer, Manage Entry/edit và Catalog add/edit. Mỗi overlay chỉ còn một vùng pan-y có momentum, header/footer không co, action bar chừa safe-area; bảng ngang bên trong không còn tranh quyền cuộn dọc. Catalog modal được portal ra `document.body` và khóa bottom navigation giống Manage/Cashflow. Rule full-height chỉ áp dụng mobile, không phá drawer nổi desktop.
- Overlay correction gate: 277/277 test, lint, typecheck, build, diff check; deployment-authenticated root 200, session không cookie 401 và API health 200. Vercel Deployment Protection chặn browser automation trước app, nên thao tác vuốt authenticated vẫn phải do người dùng xác nhận. Production vẫn là C2 recovery.
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

## 5. Checkpoint tiếp theo được đề xuất

### C3.5 — Cashflow preview approval

Người dùng kiểm tra authenticated overlay correction tại preview C3: Quỹ/Danh sách thu chi thêm-sửa giao dịch; Quỹ/Khoản vay thêm khoản vay, trả khoản và xem chi tiết; Vận hành nhập mới và sửa; Danh mục thêm/sửa. Trên mobile cần xác nhận vuốt tới cuối form, header và hai nút cuối vẫn thao tác được, bottom navigation không che form; trên desktop drawer vẫn là panel nổi đúng C2. Sau đó hoàn tất duyệt Cashflow. Không chạy business write production trong bước duyệt giao diện. Chưa chuyển Settings/Observability nếu Cashflow chưa đạt `USER_APPROVED`.

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

## 7. Rủi ro và điều kiện trước C3.4

1. **Role coverage**: admin đã smoke production; operator/shareholder có contract/unit gate nhưng chưa có representative production smoke.
2. **Rollback**: không xóa recovery C2, legacy C1/alias hoặc Apps Script `@281` cho đến khi người dùng phê duyệt kết thúc retention.
3. **PWA/cache cũ**: tiếp tục theo dõi client đã cài PWA/service worker legacy và cache path cũ.
4. **Runtime warning**: Vercel Node 24 có thể ghi `DEP0169 url.parse()` trên `/api/app/` dù HTTP 200; source project không có call site trực tiếp.
5. **Dữ liệu**: mọi thay đổi Google Sheet/Supabase schema phải là migration riêng được phê duyệt; Google Sheets vẫn là source of truth.
6. **Golden runtime**: template tĩnh không đủ; phải port cả client runtime và data-selection semantics.
7. **Visual approval**: HTTP/DOM/unit test không thay thế ảnh authenticated và xác nhận trực tiếp của người dùng.
8. **CSS dependency/cascade**: mọi surface tiếp theo phải audit font/script/asset thật, DOM wrapper và selector rò rỉ từ shared CSS; copy stylesheet đơn thuần không đủ.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline hiện tại:

- Production `/` redirect tới C2 legacy shell và final 200.
- Production deployment: `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`, Apps Script recovery `@281`.
- Dashboard golden 07/2026: 270.513.180 / 94.863.960 / 175.649.220 / 341.770.935 / -166.121.715.
- Nhánh triển khai: `codex/c3-golden-master`, base `a5e29bf`.
- Candidate overlay correction `dpl_Fi2JXxP4kJPbYBaNvZkZ1i1ktUX3` đã READY tại `https://vantaidongbac-c3-preview.vercel.app`; chờ người dùng phê duyệt thao tác vuốt authenticated trên Cashflow, Manage/Entry và Catalog.
- Gate candidate: 277/277 test, lint, typecheck, build, `git diff --check`, source/CSS overlay audit; root deployment-authenticated 200, session unauthenticated 401 và API health 200. Production vẫn resolve `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`.

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
- Ngày xác nhận: 2026-07-14.
- Cập nhật khi: các điều kiện tại mục 9 thay đổi.
