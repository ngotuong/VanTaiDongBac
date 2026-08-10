# CHANGELOG

> **HISTORICAL / INCOMPLETE:** File này ghi một phần thay đổi cũ nhưng không theo kịp các checkpoint sau migration. Dùng Git history và timeline trong `PROJECT_CONTEXT.md` cho handoff; không dùng mục `Unreleased` bên dưới để suy ra worktree hoặc bước tiếp theo.

## Unreleased

### Phase B1 — Next Report

- Chuyển initial Report read sang Server Component và shared server API client với workbook Vận tải được resolve phía server.
- Thêm same-origin `/next-accounts/report-data/` cho đổi tháng/làm mới; browser không nhận workbook ID hoặc Sheet links.
- Render nguyên bốn matrix backend, giữ tab, search, month, CSV và legacy Report rollback.
- Thêm loading/empty/error/retry, accessible tab/table semantics và responsive design-token styles.

### Next Foundation A2 — Application shell và shared platform

- Thêm dynamic root layout với server auth guard, role-aware navigation và rollback link về `/` legacy.
- Thêm workbook context provider, typed server/client API clients, correlation logging và loading/error/not-found boundaries.
- Chuẩn hóa semantic design tokens, focus/touch/responsive/dark/reduced-motion states cho shared shell.
- Thêm ESLint, TypeScript quality gates và A2 characterization tests; chưa chuyển business module nào của Phase B.

### Next Foundation A1 — Runtime, cookie auth và workbook context

- Chuyển Next canary sang Vercel Next runtime động và reverse-proxy `/next-accounts/*` cùng origin, giữ `/` legacy.
- Thêm Supabase server cookie session, CSRF/origin guard, refresh và sign-out cleanup.
- Dùng authenticated JWT + RLS cho active user profile và server allowlist cho workbook `module + year`.
- Thêm vertical slice read-only `/next-accounts/foundation/`; không migration hoặc ghi Google Sheet.
- Production smoke đạt cho admin sign-in/context/sign-out; RBAC parity còn lại được bảo vệ bằng contract tests.

### Documentation — Bounded Next.js migration handoff

- Thêm `NEXTJS_MIGRATION_PLAN.md` với 12 checkpoint hữu hạn từ foundation đến legacy removal và Definition of Done rõ cho từng module.
- Viết lại `PROJECT_CONTEXT.md` thành current-state handoff duy nhất trả lời sáu câu hỏi khởi động.
- Rút `docs/ai/AI_START_HERE.md` thành router tài liệu theo tác vụ và cập nhật `AGENTS.md` để mặc định chỉ bắt buộc đọc `AGENTS.md` + `PROJECT_CONTEXT.md`.
- Đánh dấu `REFACTOR_PLAN.md` Step 1–36 và `AUDIT_REPORT.md` là historical; không còn dùng để suy ra bước tiếp theo.
- Cập nhật documentation ownership; không thay đổi code, runtime, API, schema, Google Sheet hoặc deployment.

### Documentation — Target architecture and Agent handoff

- Thêm `TARGET_ARCHITECTURE.md` làm nguồn chuẩn cho layered target architecture, dependency direction, refactor principles và approval gate.
- Chuẩn hóa prompt dùng khi bắt đầu cuộc trò chuyện mới để Agent chỉ báo cáo trạng thái rồi chờ phê duyệt.
- Cập nhật `AI_START_HERE.md` và `PROJECT_CONTEXT.md` để bắt buộc đọc kiến trúc đích và không tự bắt đầu Step 11.
- Không thay đổi code, runtime, schema, nghiệp vụ hoặc deployment.

### Phase 4 — Refactor Step 1

- Thêm `tests/fixtures/baseline-characterization.json` để ghi nhận public API actions, runtime source surfaces, mapping form Vận tải, Supabase cache/queue tables và feature flag defaults hiện tại.
- Thêm `tests/baseline-characterization.test.js` để phát hiện contract drift trước các bước refactor tiếp theo.
- Không thay đổi runtime code, nghiệp vụ, giao diện, Google Sheet schema, Supabase schema hoặc deployment behavior.

### Phase 4 — Refactor Step 2

- Thêm `tests/api-rbac-contract.test.js` để kiểm tra frontend action/method khớp `PublicApi`, không có business write qua GET, shareholder giữ deny-by-default và account administration vẫn admin-only.
- Khóa thứ tự enforcement tại Vercel proxy và proxy-secret checks tại Apps Script boundaries.
- Không thay đổi runtime module, API contract, permission, nghiệp vụ, giao diện hoặc deployment behavior.

### Phase 4 — Refactor Step 3

- Thêm `tests/cache-key-parity.test.js` để thực thi và so sánh trực tiếp cache-key builders giữa `SupabaseService.gs` và `client_api.html`.
- Bảo vệ catalog keys, fund form/catalog keys, month normalization, transaction filter keys, manage month keys và dashboard/recent literals.
- Không thay đổi runtime module, cache key, payload, nghiệp vụ, giao diện hoặc deployment behavior.

### Phase 4 — Refactor Step 4

- Thêm `tests/fixtures/report-golden.synthetic.json` với dữ liệu tổng hợp khác nhau cho `05/2026`, `06/2026`, `07/2026` và kết quả `Tất cả`, không chứa số liệu production.
- Thêm `tests/report-golden.test.js` để khóa KPI parsing backend/frontend, explicit payroll matching, month-label preservation, detail parsing và all-period aggregation.
- Không thay đổi report runtime, công thức Google Sheet, payload, nghiệp vụ, giao diện hoặc deployment behavior.

### Phase 4 — Refactor Step 5

- Thêm `tests/fixtures/sheet-write-preservation.synthetic.json` làm baseline tổng hợp cho value, formula R1C1, format, validation và metadata; không chứa Spreadsheet ID hoặc dữ liệu production.
- Thêm `tests/sheet-write-preservation.test.js` để khóa hành vi partial update, skipped columns, bảo toàn formula có sẵn, lan formula mẫu, sao chép format và mở rộng số dòng.
- Test chạy hoàn toàn trên Sheet/Range giả lập, không ghi Google Sheet thật và không thay đổi runtime module, schema, công thức, nghiệp vụ, giao diện hoặc deployment behavior.

### Phase 4 — Refactor Step 6

- Thêm `tests/fixtures/queue-lifecycle.synthetic.json` làm baseline tổng hợp cho trạng thái queue, transport metadata replay, Fund voucher replay/conflict và public result shape.
- Thêm `tests/queue-lifecycle.test.js` để khóa duplicate enqueue, atomic/stale claim, max attempts, retry sau lỗi, chống ghi trùng và các invariant giữa worker với migration queue.
- Test không tạo job Supabase hoặc ghi Google Sheet thật; không thay đổi queue schema, worker, runtime module, nghiệp vụ, giao diện hoặc deployment behavior.

### Phase 4 — Refactor Step 7

- Thêm `NormalizationUtils.gs` làm nguồn duy nhất cho phép chuẩn hóa chuỗi thuần túy `null/undefined -> ''`, còn lại dùng `String(value).trim()`.
- Giữ nguyên `clean_()` tại `AppConfig`, `ValidationService`, `SheetService`, `FundService` và `SupabaseService` dưới dạng compatibility wrapper; không đổi call site hoặc public API.
- Thêm `tests/backend-normalization.test.js` để khóa parity cho null, Unicode whitespace, chuỗi, số, boolean, array và object conversion.
- Không thay đổi thuật toán ngày/tháng/số, timezone, nghiệp vụ, giao diện, Sheet schema, cache key hoặc queue contract.
- Đã push Apps Script source và deploy production `@249 - Refactor Step 7 shared clean normalization`; smoke test `health` thành công.

### Phase 4 — Refactor Step 8

- Thêm `SupabaseHttpClient.gs` để cô lập REST/RPC transport, Script Properties, auth headers và HTTP error handling khỏi sync/worker orchestration.
- Giữ nguyên `readRows_`, `insertRows_`, `updateRows_`, `upsertRows_`, `callRpc_` trong `SupabaseService.gs` dưới dạng compatibility wrapper.
- Thêm `tests/supabase-http-client.test.js` khóa request snapshots, query encoding, headers, payload, non-2xx messages, invalid JSON và config validation.
- Không thay đổi table name, query syntax, service-role configuration, schema, repository, cache key, queue hoặc retry behavior.
- Đã push Apps Script source và deploy production `@250 - Refactor Step 8 extract Supabase HTTP client`; smoke test `health` và `getSupabaseSyncStatus(1)` thành công.

### Phase 4 — Refactor Step 9

- Thêm `SupabaseBundleRepository.gs` làm persistence boundary cho các bảng cache bundle, giữ table/query/row/conflict key tại call site orchestration.
- Thêm `SupabaseSyncStatusRepository.gs` sở hữu table `sync_status` và conflict key `sync_key`; payload, timestamp và response mapping vẫn ở `SupabaseService`.
- Thêm `tests/supabase-repositories.test.js` để khóa delegation, row/query parity, status key/timestamp và ranh giới với write-job repository chưa tách.
- Không thay đổi schema, primary key, payload shape, sync scope, cache audit logic, worker hoặc queue behavior.
- Đã push Apps Script source và deploy production `@251 - Refactor Step 9 extract Supabase repositories`; smoke test `health` và `getSupabaseSyncStatus(1)` thành công.

### Phase 4 — Refactor Step 10

- Thêm `CacheAuditService.gs` để cô lập input normalization, Supabase `in` encoding, payload sanitization, stable hashing và audit result formatting.
- Giữ repository reads, Google Sheet live reads và public `getReportCacheAudit`/`getManageCacheAudit` orchestration trong `SupabaseService.gs`.
- Thêm `tests/cache-audit-service.test.js` khóa deterministic hash, volatile-field exclusion và các result shape `ok`, `stale`, `missing` hiện hữu.
- Không thay đổi live-read scope, cache key, table/query, audit messages, source of truth hoặc sync behavior.
- Đã push Apps Script source và deploy production `@252 - Refactor Step 10 extract cache audit service`; smoke test `health` và `getManageCacheAudit(['NL_VanChuyen'], 1)` thành công.
