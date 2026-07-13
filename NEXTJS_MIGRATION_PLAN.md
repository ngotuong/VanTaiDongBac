# NEXTJS_MIGRATION_PLAN

## 1. Mục đích

Đây là roadmap hữu hạn để đưa Next.js từ static canary thành presentation layer chính của Vận tải Đông Bắc.

File này trả lời:

- còn những checkpoint nào;
- dependency và thứ tự thực hiện;
- khi nào một module được coi là đã chuyển xong;
- khi nào được cutover `/`;
- khi nào có thể xóa frontend legacy.

Trạng thái/checkpoint sống vẫn thuộc `PROJECT_CONTEXT.md`. Kiến trúc đích tổng quát thuộc `TARGET_ARCHITECTURE.md`. File này không tự động phê duyệt bất kỳ checkpoint nào.

## 2. Baseline bắt đầu

Trạng thái tại ngày 2026-07-12:

- Next.js `16.2.10`, React `19.2.7`, App Router.
- Next đang `output: 'export'` dưới `/next-accounts`.
- `/` vẫn là frontend legacy HTML/CSS/JavaScript.
- React islands/DOM bridges tồn tại để canary và rollback.
- Report là route Next độc lập đầu tiên gọi API hiện có.
- Dashboard, Manage, Entry, Catalog, Cashflow, Accounts và Observability chưa hoàn thành migration độc lập.
- Vercel API proxy, Supabase Auth/RBAC, Apps Script service boundaries, cache/queue và test baseline đã tồn tại.
- Google Sheets vẫn là source of truth.
- Refactor Step 1–36 đã hoàn thành và được lưu trong `REFACTOR_PLAN.md` dưới dạng lịch sử.

## 3. Definition of Done toàn chương trình

Chương trình chỉ hoàn thành khi đồng thời đạt:

1. `/` là Next.js App Router application shell production.
2. Mọi module người dùng chạy độc lập trong Next.js.
3. Không module production nào cần `index.html`, `client_*.html`, React island flag, DOM bridge hoặc frontend global legacy.
4. Auth session dùng được an toàn ở Next server boundary.
5. Workbook/year context có contract chính thức.
6. Initial read dùng Server Component/server fetch khi phù hợp; interaction dùng Client Component.
7. API/RBAC contract thống nhất và được enforce server-side.
8. Apps Script chỉ còn API/integration/worker/sync, không render production HTML.
9. Google Sheet formula/schema/source-of-truth invariants được giữ nguyên.
10. Mỗi module có build, lint/type-check, test, role và responsive verification phù hợp.
11. `/` cutover có rollback deployment/route đã kiểm chứng.
12. Legacy frontend được xóa trong checkpoint riêng sau thời gian ổn định.

## 4. Definition of Done cho một module

Một module chỉ được đánh dấu `DONE` khi:

- route Next hoạt động độc lập;
- không gọi hàm global/DOM bridge của legacy;
- không cần markup từ `index.template.html` hoặc `client_*.html`;
- dùng API client/contract thống nhất;
- có loading, empty, error, auth và permission state;
- không chứa authoritative business/report calculation trong UI;
- server/client component boundary được giải thích;
- cache/fallback/write semantics giữ nguyên hoặc có migration được duyệt;
- role matrix pass;
- mobile/tablet/desktop QA pass;
- test/build/lint/type-check gate phù hợp pass;
- legacy path vẫn rollback được cho đến checkpoint cutover ổn định.

## 5. Roadmap hữu hạn

Trạng thái cho phép: `NOT STARTED`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| ID | Checkpoint | Trạng thái ban đầu | Dependency |
| --- | --- | --- | --- |
| A1 | Runtime, cookie auth và workbook context | DONE | Documentation checkpoint |
| A2 | Next application shell và shared platform | DONE | A1 |
| B1 | Hoàn thiện Report | DONE | A2 |
| B2 | Migrate Dashboard | DONE | B1 |
| B3 | Migrate Manage read-only | DONE | A2 |
| B4 | Migrate Entry/write lifecycle | DONE | B3 |
| B5 | Migrate Catalog | DONE | A2 |
| B6 | Migrate Cashflow/Quỹ | DONE | A2; có thể sau B4 |
| B7 | Migrate Accounts, Settings và Observability | DONE | A2 |
| C1 | Cutover `/` sang Next.js | DONE | B1–B7 |
| C2 | Ổn định production và xác nhận rollback | NOT STARTED | C1 |
| D1 | Xóa legacy frontend/HtmlService presentation | NOT STARTED | C2 + thời gian ổn định |

Kế hoạch hiện có **12 checkpoint**. Chỉ được chia một checkpoint nếu audit trước implementation chứng minh không thể deploy/rollback an toàn trong một change set. Mọi split phải cập nhật bảng này và `PROJECT_CONTEXT.md`, không tạo chuỗi step mở không có điểm kết thúc.

## 6. Phase A — Foundation

### A1 — Runtime, cookie auth và workbook context

Mục tiêu:

- quyết định Next runtime trên Vercel thay cho static-export-only;
- thiết kế Supabase cookie session cho server boundary;
- định nghĩa request user và RBAC parity;
- định nghĩa workbook Vận tải/Thu chi và year context;
- chứng minh read-only server fetch nhỏ;
- giữ `/` legacy.

Không thuộc phạm vi:

- chuyển Dashboard/Manage/Entry/Cashflow;
- thay source of truth;
- migration Sheet/Supabase;
- bật toàn bộ React flags.

Gate:

- threat model cookie/CSRF/session refresh;
- Vercel route/rewrite/deploy rollback proof;
- server không nhận service role/proxy secret từ browser;
- workbook context không fallback mơ hồ;
- current legacy production không đổi.

### A2 — Application shell và shared platform

Mục tiêu:

- root layout, navigation và role-aware shell;
- server/client API clients;
- auth guard, loading/error/not-found boundaries;
- workbook/year context provider;
- shared design tokens/components;
- logging/error correlation cơ bản;
- quality gates `lint` và type-check được định nghĩa.

Không chuyển business module trong A2 ngoài placeholder/navigation cần thiết.

## 7. Phase B — Module migration

### B1 — Report

- chuyển initial read khỏi mount-only waterfall khi auth/runtime cho phép;
- truyền workbook/year context chính xác;
- giữ nguyên bốn matrix chuẩn từ backend/Sheet;
- giữ tab, search, month và export;
- không tự tính lại KPI/report meaning.

### B2 — Dashboard

- route Next độc lập;
- loại bỏ startup/dashboard duplicate payload;
- giữ Supabase cache và Apps Script fallback đúng contract;
- đối chiếu số liệu với Sheet/report bundle.

### B3 — Manage read-only

- sáu sheet `NL_*`, filter, pagination và row identity;
- giữ recent/month cache semantics;
- chưa chuyển write nếu B4 chưa bắt đầu.

### B4 — Entry/write lifecycle

- form schema và validation UI;
- submit direct/queue semantics đúng action;
- pending/processing/synced/failed states;
- idempotency, reconciliation, retry và formula preservation;
- không test write production nếu chưa duyệt riêng.

### B5 — Catalog

- catalog read và write theo role;
- virtual `DM_ThamSo_TS`/`DM_ThamSo_GD` giữ mapping;
- không đổi effective-date/history semantics;
- cache invalidation/sync sau ghi đúng contract.

Hoàn thành ngày 2026-07-13. Route Next độc lập giữ chín display catalog, server-first cache/fallback, direct CRUD contract hiện hữu và mapping clear-only cho hai view ảo. Không chạy business write production. Để giữ giới hạn Vercel Hobby, Catalog dùng chung read boundary `manage-data`; prebuilt chỉ publish endpoint thật, không publish helper repository/service. Placeholder `/fund-catalog` riêng được bỏ khỏi canary; Fund Catalog vẫn thuộc B6 trong module Thu chi.

### B6 — Cashflow/Quỹ

- Overview, Transactions, Loans và Fund Catalog;
- giữ domain Thu chi độc lập;
- voucher/idempotency, reconciliation và pending-job semantics;
- giữ bound script ngoài web architecture nhưng tài liệu hóa đường bypass.

Checkpoint này có thể split thành B6a/B6b nếu preflight chứng minh write path quá lớn; split tối đa phải được xác định trước khi code B6.

Hoàn thành ngày 2026-07-13, không cần split. Route `/cashflow` là module Next độc lập cho Overview, Transactions, Loans và Fund Catalog; giữ Supabase cache → Apps Script fallback, queue/idempotency/pending overlay cho giao dịch, reconciliation cho khoản vay và encoded native-range row identity cho danh mục. Shell resolve đúng workbook `cashflow · 2026`. Bound script vẫn là đường ghi ngoài web/RBAC và không được sửa/deploy trong checkpoint này. Không chạy business write production. Helper server-only được chuyển khỏi `api/` để Vercel chỉ publish hai API entrypoint và nhóm Next runtime, đạt Hobby gate bằng deploy chuẩn thay vì sửa prebuilt artifact.

### B7 — Accounts, Settings và Observability

- đổi mật khẩu và account administration;
- admin/operator/shareholder behavior;
- sync status, audit và retry operational actions;
- heavy audit chỉ chạy do thao tác chủ động;
- không cache dữ liệu account nhạy cảm ở shared edge.

Hoàn thành ngày 2026-07-13. Route `/settings` và `/observability` là hai module Next độc lập, không dùng DOM bridge. Mọi user active giữ quyền đổi mật khẩu; account list/create/update/reset chỉ admin và chỉ tải client-side qua proxy `no-store`, temporary password chỉ giữ trong state phiên hiện tại. Admin/operator được tải sync status/write queue nhẹ; quick/deep/all/report audit và retry chỉ chạy sau thao tác chủ động. Legacy islands được giữ làm rollback đến C1/C2. Không chạy account write, audit nặng, retry/worker hoặc migration production trong smoke B7.

## 8. Phase C — Cutover

### C1 — Cutover `/`

- Next application shell trở thành `/`;
- legacy có URL/deployment rollback rõ;
- PWA manifest/icon/navigation vẫn đúng;
- smoke theo từng role và module;
- không xóa legacy trong cùng checkpoint.

Hoàn thành ngày 2026-07-13. Production `https://dongbac.vercel.app/` chạy Next.js App Router trực tiếp, không còn `basePath` hoặc rewrite canary. Root auth gate dùng same-origin session cookie; PWA manifest/icon và toàn bộ route module đã chuyển về path root. Deployment hiện tại là `dpl_6z9jo6PWmpZDXPxtc3sfHhniTXSq`. Legacy không bị xóa và được giữ tại `https://vantaidongbac-legacy.vercel.app` (`dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`). Smoke C1 chỉ đọc; không chạy business/account write hoặc audit/worker nặng.

### C2 — Production stabilization

- quan sát auth failures, API errors, request duplication và cache fallback;
- đối chiếu báo cáo/Sheet;
- kiểm tra queue, worker và sync status;
- sửa regression trong scope nhỏ;
- xác nhận rollback và go/no-go cho D1.

## 9. Phase D — Legacy removal

### D1 — Xóa presentation legacy

Chỉ thực hiện sau C2 và thời gian ổn định được người dùng chấp thuận:

- dừng build `index.template.html`, `client_*.html`, `styles_*.html`;
- xóa React island bundles, bridge và feature flags không còn consumer;
- ngừng Apps Script HtmlService presentation nếu không còn consumer;
- giữ Apps Script API/integration source;
- cập nhật architecture, workflow, rollback và documentation router;
- chạy dead-code/call-site audit trước khi xóa.

## 10. Quality gates chung

Mỗi checkpoint phải chọn gate theo rủi ro, tối thiểu:

- `git diff --check`;
- `npm run build`;
- `npm run lint` sau A2;
- project type-check sau A2;
- `npm test`;
- API/RBAC contract tests khi liên quan;
- no secret/static template leakage;
- responsive 375×667, 390×844, 430×932, 768×1024, 1440×900 cho UI;
- smoke unauthenticated và role phù hợp;
- representative data verification read-only;
- write/migration production chỉ khi có phê duyệt riêng;
- rollback instructions và checkpoint deployment rõ.

## 11. Quy tắc quản lý roadmap

- `PROJECT_CONTEXT.md` chỉ ghi checkpoint gần nhất và checkpoint tiếp theo.
- File này ghi toàn bộ roadmap và trạng thái 12 checkpoint.
- Không đánh dấu `DONE` chỉ vì có markup/canary route.
- Không bắt đầu checkpoint kế tiếp nếu người dùng chưa phê duyệt rõ.
- Không trộn foundation, module migration, cutover và legacy deletion.
- Nếu source audit làm thay đổi số checkpoint, phải giải thích dependency, rủi ro và điểm kết thúc mới trước khi code.
- Quyết định kiến trúc lớn nên có ADR nếu ảnh hưởng auth, source of truth, runtime hoặc cutover.

## 12. Trạng thái tài liệu

- Loại: `CURRENT` bounded migration roadmap.
- Phạm vi: Next.js foundation, module migration, cutover và legacy removal.
- Baseline: Phase 6 Report và audit repository ngày 2026-07-12.
- Owner current checkpoint: `PROJECT_CONTEXT.md`.
- Owner target architecture: `TARGET_ARCHITECTURE.md`.
- Ngày xác nhận: 2026-07-12.
- Cập nhật khi: checkpoint status/dependency/scope hoặc Definition of Done thay đổi.
