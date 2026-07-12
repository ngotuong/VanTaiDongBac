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
- `/` vẫn do frontend legacy render; Next.js chưa phải application shell chính.
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

### Next Foundation A1 — Runtime, cookie auth và workbook context

Trạng thái: **hoàn thành ngày 2026-07-12**.

Phạm vi:

- chuyển source Next khỏi static-export-only và deploy Vercel Next runtime canary riêng;
- reverse-proxy `/next-accounts/*` cùng origin trong khi giữ `/` legacy;
- thêm Supabase server cookie session với same-origin/CSRF guard, refresh và sign-out cleanup;
- dùng JWT người dùng + RLS để đọc chính active `app_users` profile, không cần service role trong foundation auth;
- resolve workbook theo server allowlist `module + year`, không nhận Spreadsheet ID tùy ý;
- chứng minh bằng vertical slice server-rendered `/next-accounts/foundation/`, không đọc/ghi Google Sheet.

Verification A1:

- `npm test`: 309/309 pass tại gate gần nhất;
- `npm run build`: pass; `/foundation` được xác nhận dynamic server-rendered, các canary route còn lại vẫn prerender tĩnh;
- `git diff --check`: pass;
- branch `codex/next-foundation-a1` đã push GitHub;
- Next canary production: `dpl_FPfWQJauYCf64iF2W5FY4rfL3GCq`, alias `vantaidongbac-next-canary.vercel.app`;
- production legacy + same-origin rewrite: `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`;
- smoke đạt: `/` legacy `200`, Next shell/Report/Foundation `200`, session/runtimeContext không token `401`, same-origin session thiếu payload `400`, sai origin `403`;
- authenticated production smoke bằng tài khoản admin đạt: sign-in, role, cookie server, `transport · 2026`, reject năm `2027`, sign-out và cookie cleanup;
- operator/shareholder parity được giữ bằng API/RBAC contract tests; không tạo tài khoản production mới chỉ để smoke;
- không migration Sheet/Supabase, không thay đổi Apps Script deployment và không chạy business write.

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

### Next Foundation A2 — Application shell và shared platform

Chỉ bắt đầu sau khi người dùng phê duyệt rõ ràng checkpoint A2 trong `NEXTJS_MIGRATION_PLAN.md`.

Mục tiêu A2:

1. Tạo root layout, navigation và role-aware application shell.
2. Chuẩn hóa server/client API clients và auth guard.
3. Tạo loading/error/not-found boundaries và workbook/year context provider.
4. Thiết lập shared design tokens/components và correlation logging cơ bản.
5. Định nghĩa quality gates `lint` và type-check.
6. Giữ `/` legacy và chưa chuyển business module ngoài placeholder/navigation cần thiết.

A2 không tự động chuyển Dashboard, Entry, Manage, Catalog hoặc Cashflow.

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

## 7. Rủi ro và điều kiện trước A2

Các điều kiện bắt buộc phải làm rõ trước khi code A2:

1. **Canary deployment boundary**
   - runtime Next phải deploy bằng project/config riêng, không dùng `vercel.next.json` để đè deployment legacy;
   - cần reverse-proxy `/next-accounts/*` dưới cùng origin để dùng host-only cookie; domain/route và rollback canary cần được duyệt trước deploy.
2. **Shared shell chưa được phép thành module migration**
   - navigation chỉ là placeholder/compatibility;
   - không kéo business data hoặc write lifecycle vào A2.
3. **Workbook context consumer**
   - provider chỉ truyền context đã resolve;
   - từng module chỉ chuyển sang context mới tại checkpoint B tương ứng.
4. **RBAC và secret**
   - role-aware UI không thay thế proxy enforcement;
   - không render service role, proxy secret, refresh token hoặc Spreadsheet ID.
5. **Quality gates đang thiếu**
   - repository chưa có `npm run lint`;
   - chưa có TypeScript/project type-check độc lập;
   - cần quyết định thêm gate mà không trộn migration source lớn.
6. **Không đụng dữ liệu production**
   - A2 chỉ xây shared platform;
   - không migration Sheet/Supabase, không test ghi production nếu chưa duyệt riêng.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline đã xác nhận trong A1:

- `npm run build`: pass; `/foundation` dynamic, các route canary còn lại được prerender.
- `npm test`: 309/309 pass.
- `npm run lint`: chưa tồn tại.
- TypeScript check độc lập: chưa cấu hình; source Next hiện là JS/JSX.
- Production `/`: frontend legacy, chưa đăng nhập sẽ dừng ở auth gate.
- Production `/next-accounts/reports/`: được reverse-proxy sang Next runtime canary.
- Responsive auth gate không horizontal overflow tại 375, 390, 430, 768 và 1440 px.
- Next Report dùng tab cuộn ngang tại mobile; không làm tràn document.

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
