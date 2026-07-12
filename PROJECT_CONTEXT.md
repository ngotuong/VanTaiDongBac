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
  └─ /next-accounts/*         -> Next.js App Router static export/canary
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
- Route `/next-accounts/reports/` là frontend Next độc lập đầu tiên dùng API Report hiện có.
- Các route Next khác chủ yếu là canary/compatibility surface, chưa phải module độc lập hoàn chỉnh.

### 3.3. Luồng Report hiện tại

`/next-accounts/reports/` hydrate ở browser, lấy Supabase session rồi gọi:

```text
Browser -> GET /api/app?action=getReportBundle
        -> Vercel auth/RBAC
        -> Supabase report_bundles cache
        -> fallback Apps Script nếu miss/forceRefresh
        -> Google Sheet/report cache
```

Dashboard không dùng Report service mới; Entry và Manage cũng chưa chuyển sang frontend Next độc lập.

## 4. Checkpoint gần nhất đã hoàn thành

### Next Foundation A2 — Application shell và shared platform

Trạng thái: **hoàn thành ngày 2026-07-12**.

Phạm vi hoàn thành:

- root layout động với server auth guard, role-aware application shell và rollback link về `/` legacy;
- workbook/year context provider dùng context server đã resolve;
- typed server/client API clients với cookie forwarding, same-origin credentials và correlation ID;
- loading/error/not-found boundaries và structured server error logging cơ bản;
- semantic design tokens cho focus, touch, responsive, dark mode và reduced motion;
- ESLint và TypeScript type-check độc lập;
- không chuyển business module Phase B, không migration hoặc ghi Google Sheet.

Verification A2:

- `npm test`: 316/316 pass;
- `npm run lint`: pass;
- `npm run typecheck`: pass;
- `npm run build:next-accounts`: pass; toàn bộ route shell dynamic server-rendered;
- branch `codex/next-foundation-a2` đã push GitHub; commit chốt runtime `ea42744`;
- Next canary production: `dpl_DuFhuaRHL9oU2YWsK93FhYuwiQBp`, alias `vantaidongbac-next-canary.vercel.app`;
- production same-origin `https://dongbac.vercel.app/next-accounts/` đã xác nhận unauthenticated quay đúng một redirect về `/` legacy, không còn vòng lặp basePath;
- authenticated production smoke bằng tài khoản admin đạt: session `200`, shell `200`, đầy đủ navigation, `Vận tải · 2026` và sign-out `200`;
- responsive behavior được bảo vệ bằng A2 CSS/test contract cho touch target, focus, breakpoint 900 px, reduced motion và không dùng overflow-x hidden; browser viewport visual QA cần chạy lại nếu thay đổi shell layout;
- operator/shareholder parity tiếp tục được bảo vệ bằng API/RBAC contract tests.

Checkpoint nền tảng trước đó A1 đã hoàn thành ngày 2026-07-12, branch `codex/next-foundation-a1` đã push; Next canary A1 là `dpl_FPfWQJauYCf64iF2W5FY4rfL3GCq`, production legacy + rewrite là `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`.

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

### Phase B1 — Hoàn thiện Report

Chỉ bắt đầu sau khi người dùng phê duyệt rõ ràng checkpoint B1 trong `NEXTJS_MIGRATION_PLAN.md`.

Mục tiêu B1:

1. Chuyển initial Report read khỏi mount-only waterfall khi auth/runtime cho phép.
2. Truyền đúng workbook/year context vào Report.
3. Giữ nguyên bốn matrix chuẩn từ backend/Google Sheet.
4. Giữ tab, search, month và export hiện có.
5. Không tự tính lại KPI hoặc ý nghĩa báo cáo.

B1 không tự động chuyển Dashboard, Entry, Manage, Catalog hoặc Cashflow.

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

## 7. Rủi ro và điều kiện trước B1

Các điều kiện bắt buộc phải làm rõ trước khi code B1:

1. **Initial read và auth**
   - tận dụng server auth/context A2 để tránh mount-only waterfall;
   - không tạo duplicate Report request giữa server và client hydration.
2. **Report contract**
   - giữ nguyên bốn matrix chuẩn do backend/Sheet trả về;
   - không tự tính lại KPI, payroll matching hoặc ý nghĩa số liệu ở Next.
3. **Workbook context**
   - Report phải dùng đúng `transport + year` đã resolve;
   - không nhận Spreadsheet ID tùy ý từ browser và không fallback workbook mơ hồ.
4. **RBAC và secret**
   - server/client API client A2 không thay thế proxy enforcement;
   - không render service role, proxy secret, refresh token hoặc Spreadsheet ID.
5. **Vercel Functions**
   - kiểm tra giới hạn Functions của project Hobby trước khi thêm route/server boundary;
   - helper repository/service không được publish thành endpoint độc lập.
6. **Phạm vi**
   - B1 chỉ hoàn thiện Report; không kéo Dashboard, Entry, Manage, Catalog hoặc Cashflow vào cùng checkpoint;
   - không migration Sheet/Supabase và không chạy business write production.
7. **Legacy runtimeContext environment**
   - shell A2 resolve `transport · 2026` thành công trên canary env;
   - cùng action `runtimeContext` qua project legacy hiện trả `404` do legacy deployment không có workbook mapping; B1 phải dùng shared shell/canary server context, hoặc cấu hình env legacy bằng checkpoint deploy riêng nếu còn cần endpoint này.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline mã nguồn đã xác nhận trong A2:

- `npm run build:next-accounts`: pass; mọi route shell dynamic server-rendered.
- `npm test`: 316/316 pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Production `/`: frontend legacy, chưa đăng nhập sẽ dừng ở auth gate.
- Production `/next-accounts/reports/`: được reverse-proxy sang Next runtime canary.
- Authenticated admin shell smoke đạt; responsive shell rules được khóa bằng CSS/test contract, visual viewport QA cần chạy lại khi thay đổi layout.

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
