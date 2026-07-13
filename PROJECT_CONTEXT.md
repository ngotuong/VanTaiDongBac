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
- Route `/next-accounts/reports/`, `/next-accounts/dashboard/`, `/next-accounts/manage/` và `/next-accounts/entry/` là các frontend Next độc lập.
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

Dashboard B2, Manage B3 và Catalog B5 giữ cache/fallback hiện hành. Entry B4 dùng catalog server-first, enqueue `submitRows`, kick worker, poll/retry write job và giữ Apps Script/Sheet services làm nơi validate/ghi có thẩm quyền. Catalog B5 dùng direct `saveSheetRow`/`deleteSheetRow` theo contract cũ; Apps Script tiếp tục là nơi ghi có thẩm quyền và sync lại cache sau ghi.

## 4. Checkpoint gần nhất đã hoàn thành

### Phase B5 — Migrate Catalog

Trạng thái: **hoàn thành ngày 2026-07-13**.

Phạm vi hoàn thành:

- Catalog route Next độc lập, initial read server-first và không dùng DOM bridge;
- giữ chín display catalog, search/filter/pagination, row identity và modal add/edit/delete;
- giữ nguồn vật lý `DM_ThamSo` cho `DM_ThamSo_TS`/`DM_ThamSo_GD`; delete hai view ảo chỉ clear đúng nhóm cột;
- admin/operator giữ read/write; shareholder không thấy menu và bị proxy/RBAC chặn;
- giữ direct write, cache invalidation và sync-after-write contract hiện hữu;
- dùng chung Function `manage-data` cho interaction read và bỏ placeholder `/fund-catalog` khỏi canary để giữ giới hạn Vercel Hobby;
- không thay đổi Apps Script, Google Sheet, công thức, Sheet/Supabase schema hoặc dữ liệu.

Verification B5:

- `npm test`: 336/336 pass;
- `npm run lint`: pass;
- `npm run typecheck`: pass;
- full build và `npm run build:next-accounts`: pass; 12-Function Hobby gate đạt sau prebuilt cleanup;
- branch `codex/next-catalog-b5` đã push; code `47631af`, function fixes `3c69853` và `06ff3dc`;
- Next canary production: `dpl_6Qv3rsdEiLEEAC7G7ina9j1oC3md`, alias `vantaidongbac-next-canary.vercel.app`;
- authenticated admin smoke đạt Catalog 2026, chín tab, filter, modal mở/đóng và hai view ảo;
- smoke không bấm Lưu/Xóa, không tạo production write hoặc thay đổi Sheet.

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

### Phase B6 — Migrate Cashflow/Quỹ

Chỉ bắt đầu sau khi người dùng phê duyệt rõ checkpoint B6.

Mục tiêu B6:

1. Chuyển Overview, Transactions, Loans và Fund Catalog sang Next.
2. Giữ Thu chi là domain/workbook độc lập theo năm.
3. Giữ voucher/idempotency, reconciliation, pending-job và native named-range bounds.
4. Tài liệu hóa bound-script bypass; không test business write production nếu chưa có phê duyệt riêng.

B6 không tự động chuyển Accounts/Settings/Observability.

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

## 7. Rủi ro và điều kiện trước B6

Các điều kiện B5 đã được kiểm soát. Trước B6 cần audit toàn bộ Thu chi và quyết định trước nếu phải split B6a/B6b:

1. **Thu chi scope và authorization**
   - Overview/Transactions/Loans/Fund Catalog phải giữ role hiện hành;
   - không trộn workbook Vận tải với workbook Thu chi theo năm.
2. **Write/idempotency**
   - giữ voucher, batch replay, reconciliation, queue flag và pending lifecycle;
   - không ghi production khi chưa có phê duyệt riêng.
3. **Fund Catalog bounds**
   - giữ named-range/native bounds, encoded row index và clear-only delete;
   - không biến fallback managed range thành schema mới.
4. **RBAC và secret**
   - server/client API client A2 không thay thế proxy enforcement;
   - không render service role, proxy secret, refresh token hoặc Spreadsheet ID.
5. **Vercel Functions**
   - project Hobby phải giữ không quá 12 Functions;
   - prebuilt phải loại helper `.func`; B6 tái sử dụng boundary trước khi thêm endpoint.
6. **Bound script và phạm vi**
   - audit `docs/legacy/THU_CHI_BOUND_SCRIPT.md` và source snapshot trước code;
   - không sửa bound script/workbook/schema nếu chưa có checkpoint migration riêng.
7. **Legacy runtimeContext environment**
   - shell A2 resolve `transport · 2026` thành công trên canary env;
   - cùng action `runtimeContext` qua project legacy hiện trả `404` do legacy deployment không có workbook mapping; B1 phải dùng shared shell/canary server context, hoặc cấu hình env legacy bằng checkpoint deploy riêng nếu còn cần endpoint này.
8. **Canary deploy mode**
   - project `vantaidongbac-next-canary` không kết nối Git; deploy bằng prebuilt workflow riêng;
   - các `Error Stale` cũ do build root/output sai không phải deployment active; stable alias phải luôn được kiểm tra sau deploy.

Risk register đầy đủ thuộc `docs/quality/KNOWN_RISKS.md`.

## 8. Verification baseline hiện tại

Baseline đã xác nhận trong B5:

- `npm run build:next-accounts`: pass; mọi route shell dynamic server-rendered.
- `npm test`: 336/336 pass.
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
