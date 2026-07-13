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
  └─ /                         -> redirect tạm thời tới legacy shell đã duyệt
  └─ Next module routes        -> Next.js App Router preview, chưa cut forward lại
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
- Vercel production vẫn dùng framework Next.js và build `npm run build:next-accounts`, nhưng `/` đang redirect tạm thời tới `/legacy-index.html` được tạo trong cùng build để ổn định UI/UX.
- Root layout server-render auth/workbook context; chưa đăng nhập render LoginGate cùng-origin, đăng nhập tạo HttpOnly cookie qua `/api/session`.
- Các React island trong trang legacy vẫn phụ thuộc feature flag và DOM bridge; production flag mặc định tắt tại checkpoint gần nhất.
- Route `/reports/`, `/dashboard/`, `/manage/`, `/entry/`, `/catalog/`, `/cashflow/`, `/settings/` và `/observability/` là các frontend Next production độc lập.
- Legacy source vẫn còn trong repo và hiện là presentation production tạm thời; Next API boundary cùng các route module vẫn được giữ để sửa parity trên preview. D1 chưa được phép bắt đầu.

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

### Phase C2 — Production stabilization, mở lại để khắc phục regression

Trạng thái: **IN PROGRESS ngày 2026-07-13; production đã rollback presentation an toàn, đang chờ người dùng xác nhận UI thực tế**.

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
- chưa có browser runtime để chạy click-through trực tiếp; cần người dùng xác nhận menu Báo cáo/UI trong phiên trình duyệt thật trước khi đóng C2.

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

### Hoàn tất Phase C2 recovery

Trạng thái đề xuất hiện tại: **tiếp tục C2; chưa được chuyển D1**.

Điều kiện đóng C2 recovery:

1. Người dùng xác nhận giao diện legacy, logo, menu và Báo cáo hoạt động đúng trong browser production.
2. Next preview được sửa đạt visual/navigation parity với giao diện đã duyệt trước bất kỳ cut forward mới nào.
3. Có thời gian theo dõi production không phát sinh auth/API/cache regression mới.

Sau khi C2 được đóng vẫn phải xin phê duyệt checkpoint tiếp theo; D1 hiện **NO-GO** và không được tự động bắt đầu.

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

## 7. Rủi ro và điều kiện trước D1

C2 đang mở lại sau phản hồi production và kết luận hiện tại là NO-GO cho D1. Cần kiểm soát:

1. **Thời gian ổn định**: người dùng phải chấp thuận khoảng theo dõi sau C2 trước khi xóa rollback source.
2. **Role coverage**: admin đã smoke production; operator/shareholder tiếp tục có contract/unit gate nhưng chưa có representative production smoke.
3. **Rollback**: giữ deployment recovery, deployment legacy trước recovery, alias `vantaidongbac-legacy.vercel.app` và Apps Script version `@281` cho đến khi có cut forward mới được duyệt.
4. **PWA/cache cũ**: tiếp tục theo dõi client đã cài PWA/service worker legacy và cache path cũ.
5. **Runtime warning**: Vercel Node 24 còn ghi `DEP0169 url.parse()` trên `/api/app/` dù HTTP 200; source project không có call site trực tiếp.
6. **Xóa code**: D1 phải bắt đầu bằng dead-code/call-site audit; không suy ra file legacy không còn consumer chỉ từ cutover route.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline recovery đã xác nhận:

- `npm run build:next-accounts`: pass; mọi route shell dynamic server-rendered.
- Targeted recovery tests, lint, type-check và Next build pass; full `npm test` phải chạy lại trước commit checkpoint.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Production `/`: redirect 307 tới generated legacy shell; UI Next chưa được cut forward lại.
- Production deployment hiện tại: `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`; rollback ngay trước recovery: `dpl_5qua6YTqNS1GPkWE1YGP1f1v9ouU`; legacy C1: `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`.
- Production root, health và static module assets trả 200; authenticated Report latest dùng Supabase cache và trả 200 trong khoảng 2,8 giây.
- Không có account/business write, retry hoặc worker production trong C2.

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
- Ngày xác nhận: 2026-07-13.
- Cập nhật khi: các điều kiện tại mục 9 thay đổi.
