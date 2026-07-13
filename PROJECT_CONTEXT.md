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
  ├─ /                         -> frontend legacy HTML/CSS/JavaScript trên Vercel
  └─ /next-accounts/*         -> Next.js App Router server runtime/canary
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
- `next.config.mjs` giữ `basePath: '/next-accounts'` và không dùng `output: 'export'`.
- Vercel Next runtime canary riêng đã deploy; route `/foundation` được server-render theo request.
- Production reverse-proxy `/next-accounts/*` cùng origin sang canary; `/` vẫn là legacy static.
- `/` vẫn do frontend legacy render; `/next-accounts/*` đã có shared application shell A2 nhưng chưa phải application shell production tại `/`.
- Các React island trong trang legacy vẫn phụ thuộc feature flag và DOM bridge; production flag mặc định tắt tại checkpoint gần nhất.
- Route `/next-accounts/reports/` và `/next-accounts/dashboard/` là các frontend Next độc lập.
- Các route Next khác chủ yếu là canary/compatibility surface, chưa phải module độc lập hoàn chỉnh.

### 3.3. Luồng Report hiện tại

`/next-accounts/reports/` tải initial bundle ở Server Component; tương tác đổi tháng/làm mới đi qua Next same-origin boundary:

```text
Server Component / Next report-data -> GET /api/app?action=getReportBundle
        -> Vercel auth/RBAC
        -> Supabase report_bundles cache
        -> fallback Apps Script nếu miss/forceRefresh
        -> Google Sheet/report cache
```

Dashboard B2 đọc bundle cache `__dashboard_latest__` theo workbook ở server và fallback Apps Script `getDashboard`; nó không còn trộn payload vào Report. Entry và Manage vẫn chưa chuyển sang frontend Next độc lập.

## 4. Checkpoint gần nhất đã hoàn thành

### Phase B2 — Migrate Dashboard

Trạng thái: **hoàn thành ngày 2026-07-13**.

Phạm vi hoàn thành:

- Dashboard route Next độc lập, initial read ở Server Component và không dùng DOM bridge;
- đọc Supabase `report_bundles` bằng khóa `__dashboard_latest__` + workbook server-resolved, có timeout và fallback Apps Script `getDashboard`;
- browser refresh đi qua `/next-accounts/dashboard-data/`; payload public loại Sheet links và không nhận Spreadsheet ID từ browser;
- bỏ phép trộn Dashboard vào Report; giữ KPI, biểu đồ lợi nhuận, chuyến gần nhất, bảng tháng, filter và loading/error/empty states;
- không thay đổi Apps Script, Google Sheet, công thức, Sheet/Supabase schema hoặc dữ liệu.

Verification B2:

- `npm test`: 321/321 pass;
- `npm run lint`: pass;
- `npm run typecheck`: pass;
- `npm run build:next-accounts`: pass; toàn bộ route shell dynamic server-rendered;
- branch `codex/next-dashboard-b2` đã push; code `e28f6b0`, cache timeout `374c75a`, refresh base-path fix `d9b006b`;
- Next canary production: `dpl_ES2YG5GWKXhC7H9op8mnzzTrvEmN`, alias `vantaidongbac-next-canary.vercel.app`;
- authenticated smoke đạt: initial read, refresh, filter `06/2026`, 5 KPI, chart, 24 chuyến gần nhất và 3 kỳ báo cáo;
- đối chiếu payload tháng `07/2026` đạt cho doanh thu `270.513.180`, lợi nhuận gộp `39.600.000`, lợi nhuận thực `113.953.000`;
- CSS/test gate bảo vệ responsive card, scroll-contained table, touch target, focus và reduced motion;
- operator/shareholder parity tiếp tục được bảo vệ bằng API/RBAC contract tests.

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

### Phase B3 — Migrate Manage read-only

Chỉ bắt đầu sau khi người dùng phê duyệt rõ checkpoint B3.

Mục tiêu B3:

1. Chuyển read-only cho sáu sheet `NL_*` sang route Next độc lập.
2. Giữ filter, pagination, row identity và recent/month cache semantics.
3. Resolve workbook/year phía server và giữ RBAC hiện hành.
4. Chưa chuyển edit/delete/write lifecycle; phần ghi thuộc B4.

B3 không tự động chuyển Entry/write, Catalog, Cashflow hoặc Accounts.

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

## 7. Rủi ro và điều kiện trước B3

Các điều kiện B2 đã được kiểm soát. Trước B3 cần audit riêng Manage read path, cache key, row identity và ranh giới read/write:

1. **Read-only boundary**
   - B3 chỉ đọc sáu sheet `NL_*`; không gọi save/delete/queue action;
   - edit/delete controls phải không xuất hiện hoặc bị tách rõ sang B4.
2. **Manage contract**
   - giữ row identity/`rowIndex`, filter tháng và pagination hiện có;
   - pending overlay không được làm sai dữ liệu nguồn khi write lifecycle chưa migrate.
3. **Workbook context**
   - Manage phải dùng đúng `transport + year` đã resolve;
   - không nhận Spreadsheet ID tùy ý từ browser và không fallback workbook mơ hồ.
4. **RBAC và secret**
   - server/client API client A2 không thay thế proxy enforcement;
   - không render service role, proxy secret, refresh token hoặc Spreadsheet ID.
5. **Vercel Functions**
   - kiểm tra giới hạn Functions của project Hobby trước khi thêm route/server boundary;
   - helper repository/service không được publish thành endpoint độc lập.
6. **Phạm vi**
   - B2 chỉ hoàn thiện Dashboard; không kéo Manage, Entry, Catalog hoặc Cashflow vào cùng checkpoint;
   - không migration Sheet/Supabase và không chạy business write production.
7. **Legacy runtimeContext environment**
   - shell A2 resolve `transport · 2026` thành công trên canary env;
   - cùng action `runtimeContext` qua project legacy hiện trả `404` do legacy deployment không có workbook mapping; B1 phải dùng shared shell/canary server context, hoặc cấu hình env legacy bằng checkpoint deploy riêng nếu còn cần endpoint này.
8. **Canary deploy mode**
   - project `vantaidongbac-next-canary` không kết nối Git; deploy bằng prebuilt workflow riêng;
   - các `Error Stale` cũ do build root/output sai không phải deployment active; stable alias phải luôn được kiểm tra sau deploy.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline đã xác nhận trong B2:

- `npm run build:next-accounts`: pass; mọi route shell dynamic server-rendered.
- `npm test`: 321/321 pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Production `/`: frontend legacy, chưa đăng nhập sẽ dừng ở auth gate.
- Production `/next-accounts/reports/`: được reverse-proxy sang Next runtime canary.
- Authenticated Report smoke và responsive visual QA đủ 5 viewport đạt.

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
- Ngày xác nhận: 2026-07-12.
- Cập nhật khi: các điều kiện tại mục 9 thay đổi.
