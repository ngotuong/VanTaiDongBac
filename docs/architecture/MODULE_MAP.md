# MODULE_MAP

## 1. Phạm vi

Đây là bản đồ ownership hiện hành sau D1. Frontend production chỉ còn Next.js; Apps Script là API/integration backend và không render HtmlService.

## 2. Sơ đồ module

```text
Browser / Next.js UI
  -> Next same-origin route + /api/app
  -> Supabase Auth/RBAC/cache hoặc Apps Script fallback
  -> Apps Script application/domain services
  -> Google Sheet Vận tải / Google Sheet Thu chi
```

Google Sheets vẫn là source of truth. Vận tải và Thu chi/Quỹ là hai domain độc lập.

## 3. Platform và presentation

| Module | Ownership chính | Trách nhiệm |
| --- | --- | --- |
| Next shell | `next-shell/app/`, `next-shell/components/platform/`, `app/` | Layout, auth gate, navigation, theme, route composition |
| Next API clients | `next-shell/lib/platform/` | Same-origin client/server request, typed public context |
| Dashboard | `next-shell/components/dashboard/`, `next-shell/lib/dashboard-server.ts` | Tổng quan và initial server read |
| Report | `next-shell/components/report/`, `next-shell/lib/report-server.ts` | Bốn matrix chuẩn, filter/export, cache fallback |
| Manage | `next-shell/components/manage/`, `next-shell/lib/manage-server.ts` | Sáu sheet `NL_*`, filter/pagination/read |
| Entry | `next-shell/components/entry/`, `next-shell/lib/entry-server.ts` | Form Vận tải, queue lifecycle và retry |
| Catalog | `next-shell/components/catalog/`, `next-shell/lib/catalog-server.ts` | Danh mục Vận tải, read/write theo role |
| Cashflow | `next-shell/components/cashflow/`, `next-shell/lib/cashflow-server.ts` | Overview, transactions, loans, fund catalog |
| Settings | `next-shell/components/settings/` | Đổi mật khẩu, account administration |
| Observability | `next-shell/components/observability/` | Sync status, audit chủ động, retry job |
| Vercel edge | `api/app.js`, `server/services/`, `server/repositories/` | Supabase session, allowlist/RBAC, proxy-local actions, Apps Script forwarding |
| Build/PWA | `package.json`, `next.config.mjs`, `vercel.json`, `public/` | `next build`, runtime deployment, manifest/assets |

D1 đã xóa `index.html`, `index.template.html`, `client_*.html`, `styles_*.html`, React island entry/bundle, DOM bridge và build scripts tương ứng. Rollback presentation dùng deployment C2 đã lưu, không dùng source legacy trong nhánh hiện tại.

## 4. Apps Script platform

| Module | Ownership chính | Trách nhiệm |
| --- | --- | --- |
| Runtime config | `AppConfig.gs` | Resolve Spreadsheet ID/year và kích hoạt `APP_CONFIG` |
| HTTP API | `Router.gs` | `doGet`/`doPost`, proxy-secret gate, JSON response/timing; không render HTML |
| Public API | `PublicApi.gs`, `ApiActionRegistry.gs` | Method/action dispatch và orchestration |
| Security | `SecurityService.gs` | Enforce trusted proxy secret |
| Cache/queue | `SupabaseService.gs`, `WriteJobRepository.gs`, `WriteJobWorker.gs` | Cache sync, job persistence, atomic worker lifecycle |
| Sheet infrastructure | `RuntimeCacheService.gs`, `SheetWritePreserver.gs`, `SheetReadService.gs` | Runtime cache, safe read/write, formula preservation |

Các global function trong `PublicApi.gs` chỉ phục vụ HTTP API, Apps Script editor, trigger hoặc `clasp run`; không còn consumer `google.script.run`.

## 5. Domain Vận tải

| Module | Ownership chính | Dữ liệu |
| --- | --- | --- |
| Entry | `EntryService.gs`, `ValidationService.gs`, `SheetService.gs` | `NL_*` |
| Manage | `ManageService.gs`, `SheetReadService.gs`, `SheetService.gs` | `NL_*` |
| Catalog | `CatalogService.gs`, compatibility facade trong `SheetService.gs` | `DM_*` |
| Dashboard/Report | `ReportService.gs`, `DashboardService.gs`, `ReportTableService.gs`, `ReportTempSheetService.gs`, `SheetReportCacheRepository.gs` | `BC_*`, `XL_*`, `SYS_ReportCache` |
| Reconciliation | `TransportReconciliationService.gs`, facade `EntryService.gs` | `NL_VanChuyen`, `NL_TaiXe`, `XL_DoiSoatChuyen` |

`SheetService.gs` vẫn có blast radius rộng; phải theo call chain tới implementation thực tế khi đánh giá thay đổi.

## 6. Domain Thu chi/Quỹ

| Module | Ownership chính | Dữ liệu |
| --- | --- | --- |
| Transactions | `FundTransactionRepository.gs`, `FundTransactionService.gs`, facade `FundService.gs` | `NHAP_THUCHI` |
| Overview | `FundService.gs` | `NHAP_THUCHI`, cấu hình Thu chi |
| Loans | `FundLoanRepository.gs`, `FundLoanService.gs`, facade `FundService.gs` | `NHAP_VAY` |
| Catalog | `FundCatalogRepository.gs`, `FundCatalogService.gs`, facade `FundService.gs` | named ranges, `CAIDAT` |

Bound script Thu chi tại `docs/source/thu_chi_bound_script/` là execution context riêng và không thuộc D1.

## 7. Data/cache ownership

| Nhóm | Source/adapter |
| --- | --- |
| Google Sheet config/schema | `AppConfig.gs`, `PROJECT_SCHEMA.md`, `docs/schema/` |
| Supabase schema | `supabase/migrations/`, `SUPABASE_SCHEMA.md` |
| Report cache | `ReportSyncService.gs`, `SupabaseBundleRepository.gs`, Vercel report repository |
| Startup/catalog cache | `StartupCatalogSyncService.gs` |
| Manage cache | `ManageSyncService.gs` |
| Fund cache | `FundSyncService.gs` |
| Sync status | `SupabaseSyncStatusRepository.gs` |
| Queue/log | `WriteJobRepository.gs`, `WriteJobWorker.gs` |

Không module frontend nào được truy cập Google Sheets trực tiếp hoặc chứa server secret.

## 8. Test ownership

- Contract/API/RBAC: `tests/api-*.test.js`, `tests/contracts.test.js`.
- Next module gates: `tests/next-*.test.js`.
- D1 removal gate: `tests/next-legacy-removal-d1.test.js`.
- Backend/domain/cache/queue: các test service/repository tương ứng trong `tests/`.
- Production smoke có khả năng ghi chỉ chạy khi được phê duyệt riêng.

## 9. Trạng thái tài liệu

- Loại: current module/source ownership map.
- Ngày xác nhận: 2026-07-13, checkpoint D1.
- Cập nhật khi: ownership, source of truth, runtime boundary hoặc module route thay đổi.
