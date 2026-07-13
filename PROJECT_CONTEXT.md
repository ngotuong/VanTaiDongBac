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
  └─ /                         -> Next.js App Router application shell production
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
- Vercel production dùng framework Next.js và build `npm run build:next-accounts`; rewrite proxy canary đã được gỡ.
- Root layout server-render auth/workbook context; chưa đăng nhập render LoginGate cùng-origin, đăng nhập tạo HttpOnly cookie qua `/api/session`.
- Các React island trong trang legacy vẫn phụ thuộc feature flag và DOM bridge; production flag mặc định tắt tại checkpoint gần nhất.
- Route `/reports/`, `/dashboard/`, `/manage/`, `/entry/`, `/catalog/`, `/cashflow/`, `/settings/` và `/observability/` là các frontend Next production độc lập.
- Legacy source vẫn còn trong repo nhưng chỉ được phục vụ qua deployment rollback riêng; chưa xóa trong C1.

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

### Phase C1 — Cutover `/` sang Next.js

Trạng thái: **hoàn thành ngày 2026-07-13**.

Phạm vi hoàn thành:

- production `/` đã chuyển từ legacy static sang Next.js App Router; mọi route module dùng path root, không còn proxy `/next-accounts/*`;
- auth chưa đăng nhập render LoginGate Next, đăng nhập/đăng xuất dùng same-origin `/api/session`, HttpOnly cookie, SameSite Strict và CSRF header hiện hữu;
- manifest/icon được phục vụ từ Next `public/`, start/scope `/`; viewport metadata và navigation root đã được kiểm chứng;
- Vercel production bổ sung `DEFAULT_WORKBOOK_YEAR=2026` và `WORKBOOK_CONTEXTS_JSON` cho hai workbook độc lập;
- legacy source không bị xóa; deployment `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS` được giữ tại `https://vantaidongbac-legacy.vercel.app` làm rollback;
- không thay đổi Apps Script, Google Sheet, công thức, Supabase schema hoặc dữ liệu; smoke không chạy account/business write, audit nặng, retry hoặc worker.

Verification C1:

- `npm test`: 355/355 pass; `npm run lint`, `npm run typecheck` và `npm run build:next-accounts` pass;
- branch `codex/next-root-cutover-c1`;
- Next production deployment `dpl_6z9jo6PWmpZDXPxtc3sfHhniTXSq`, alias `https://dongbac.vercel.app`, trạng thái READY;
- unauthenticated LoginGate, authenticated admin shell và tám module production đều smoke read-only, không có server error;
- responsive DOM QA đạt 375×812 và 1440×900, body không overflow và control nhỏ nhất 44px;
- PWA manifest/icon trả HTTP 200; rollback alias legacy đã kiểm tra trước cutover.

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

### Phase C2 — Production stabilization

Chỉ bắt đầu sau khi người dùng phê duyệt rõ checkpoint C2.

Mục tiêu C2:

1. Theo dõi auth failures, API errors, request duplication và cache fallback trên production Next.
2. Đối chiếu dữ liệu đại diện với Google Sheet và kiểm tra queue/worker/sync status theo scope được duyệt.
3. Sửa regression nhỏ nếu phát hiện và xác nhận rollback còn khả dụng.
4. Đưa ra go/no-go cho D1 sau thời gian ổn định được người dùng chấp thuận.

C2 không tự động xóa legacy frontend; việc xóa chỉ thuộc D1 và cần phê duyệt riêng.

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

## 7. Rủi ro và điều kiện trước C2

Cutover C1 đã hoàn thành. Trước và trong C2 cần kiểm soát:

1. **Quan sát runtime**: theo dõi 401/403/5xx, cache miss/fallback và request duplication sau cutover.
2. **Role coverage**: browser smoke C1 dùng admin; operator/shareholder tiếp tục có contract/unit gate nhưng cần representative production smoke khi có tài khoản test phù hợp.
3. **Dữ liệu**: đối chiếu read-only representative với Sheet; không biến Supabase thành source of truth.
4. **Queue/worker**: không retry/process hoặc tạo business write chỉ để smoke nếu chưa được duyệt riêng.
5. **Rollback**: giữ alias `vantaidongbac-legacy.vercel.app` và deployment legacy; không xóa source trước D1.
6. **PWA/cache cũ**: theo dõi client đã cài PWA/service worker legacy và cache path cũ trong thời gian ổn định.
7. **Runtime warning**: Vercel Node 24 ghi `DEP0169 url.parse()` trên request `/api/app/` dù HTTP 200; source project không có call site trực tiếp, cần theo dõi/nâng dependency trong C2 nếu warning còn lặp lại.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline đã xác nhận trong C1:

- `npm run build:next-accounts`: pass; mọi route shell dynamic server-rendered.
- `npm test`: 355/355 pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Production `/`: Next.js App Router; chưa đăng nhập render Next LoginGate.
- Authenticated admin smoke đạt `/`, Dashboard, Report, Manage, Entry, Catalog, Cashflow, Observability và Settings.
- Production deployment hiện tại: `dpl_6z9jo6PWmpZDXPxtc3sfHhniTXSq`; legacy rollback: `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`.
- Không có account/business write hoặc heavy audit production trong C1.

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
