# PROJECT_CONTEXT

## 1. Cách dùng handoff này

Đây là nguồn handoff sống duy nhất của dự án. Mỗi cuộc trò chuyện mới chỉ bắt buộc:

1. đọc toàn bộ `AGENTS.md`;
2. đọc toàn bộ file này;
3. kiểm tra `git status --short`.

Sau đó Agent phải có thể báo đúng sáu nội dung: dự án/module, kiến trúc production, checkpoint gần nhất, checkpoint tiếp theo, kiến trúc đích và risk/gate.

Các tài liệu khác chỉ đọc theo router ở mục 9. Tài liệu lịch sử không được dùng để suy ra current state.

## 2. Dự án và module nghiệp vụ

Vận tải Đông Bắc là web app nội bộ cho khoảng 4–5 người dùng, ưu tiên tra cứu nhanh, báo cáo đúng Google Sheet, nhập liệu an toàn, phân quyền rõ và rollback được theo checkpoint.

Đây là Apps Script Web App độc lập, không gắn cố định với một Google Sheet. Workbook được resolve theo request/năm/Script Properties; backend chính dùng `SpreadsheetApp.openById(id)`.

Hai domain độc lập:

1. **Vận tải**
   - workbook riêng theo năm;
   - Tổng quan, Báo cáo, Vận hành/Nhập liệu và Danh mục.
2. **Thu chi/Quỹ**
   - workbook riêng theo năm;
   - Tổng quan quỹ, Giao dịch, Khoản vay và Danh mục Quỹ;
   - là module/menu riêng, không chỉ là nguồn import cho Vận tải.

Một số liên kết giữa hai workbook do công thức/`IMPORTRANGE` thực hiện. Không gộp workbook, đổi tên sheet, đổi thứ tự cột hoặc sửa công thức nếu chưa có migration riêng được phê duyệt.

## 3. Kiến trúc production hiện tại

```text
Browser / Next.js App Router
        ↓
Vercel same-origin API (`/api/app`, `/api/push`, `/api/fund-alerts`)
  - Supabase HttpOnly session
  - allowlist/RBAC/origin guard
  - read cache, account và Web Push boundary
        ↓
Apps Script standalone API-only
  - application/domain services
  - authoritative Sheet writes
  - worker/trigger/cache sync/audit
        ↓
Google Sheets source of truth + Supabase read model/cache/queue/Auth
```

Vai trò:

- Google Sheets là source of truth và nguồn đối soát cuối cùng.
- Supabase cung cấp Auth, read model/cache, write queue, sync status và notification state.
- Apps Script là API/integration backend, nơi validate/ghi có thẩm quyền và đồng bộ cache.
- Vercel/Next.js là presentation và public API boundary; service-role secret không đi xuống browser.

Runtime chính:

- Next.js `16.2.11`, React `19.2.7`.
- Source route/component nằm trong `next-shell/`; root `app/` là entrypoint mỏng.
- `/` chạy Next.js App Router; Apps Script không còn render HTML.
- Auth dùng Supabase session trong cookie `HttpOnly`, `SameSite=Strict`, có refresh/keepalive.
- Workbook/year context được resolve phía server; năm dữ liệu thật hiện hành là 2026, bắt đầu từ 05/2026.
- Report runtime là Supabase-only cache; khi cache miss/lỗi, Apps Script live-compute từ Google Sheets trong execution rồi upsert lại Supabase.

Production đã xác nhận gần nhất:

- URL: `https://dongbac.vercel.app`.
- Vercel deployment: `dpl_4q2n4BYGHLa4T75WptiTrGi1VNW6`.
- Apps Script production cùng deployment ID: code version `@315`; rollback gần nhất `@302`.
- Vercel rollback gần nhất: `dpl_8f3resbHcr5ZNWMdV4PjP28Gm5yK`.
- Supabase project canonical: `lyquwesyjbpalnwfxzwl`.
- Vercel project canonical: `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`.

Preview hiện hành của checkpoint retirement:

- URL duy nhất: `https://vantaidongbac-preview.vercel.app`.
- Vercel deployment: `dpl_F2wWCd2rsKCeXF67Q8PkxBMZV3ew`.
- Apps Script Preview: `@320`, deployment ID riêng với Production.
- Chỉ deploy bằng `npm run deploy:preview`.

## 4. Quá trình dự án đã hoàn thành

Timeline này thay cho nhật ký checkpoint dài trước đây. Chi tiết sâu được giữ trong Git, `CHANGELOG.md`, `REFACTOR_PLAN.md`, `AUDIT_REPORT.md` và contract liên quan.

### 4.1. Audit và refactor nền tảng — 2026-07-11 đến 2026-07-12

- Hoàn thành technical audit và chương trình refactor Step 1–36.
- Tách service/repository/domain boundary, tăng characterization tests và giữ nguyên nghiệp vụ.
- `AUDIT_REPORT.md` và `REFACTOR_PLAN.md` hiện là tài liệu lịch sử.

### 4.2. Next.js migration A1–D1 — 2026-07-12 đến 2026-07-19

- Dựng Next.js runtime, cookie auth, workbook context và shared shell.
- Chuyển lần lượt Report, Dashboard, Manage, Entry, Catalog, Cashflow, Settings/Observability.
- Golden-master parity C3 được người dùng duyệt theo từng surface; các regression Report/nav/mobile drawer được sửa và retest.
- D1 loại bỏ presentation legacy khỏi source; rollback presentation được giữ bằng deployment Vercel bất biến.
- Auth session continuity đã promote production và authenticated smoke PASS.
- `NEXTJS_MIGRATION_PLAN.md` là roadmap lịch sử đã hoàn thành, không còn là backlog sống.

### 4.3. Report cache E1.1–E1.6 — 2026-07-18 đến 2026-07-19

- Tạo schema foundation, chạy dual parity và cutover `REPORT_CACHE_MODE=supabase`.
- Compact `SYS_ReportCache` từ 198.900 xuống 40 hàng rollback sau backup/fingerprint/approval.
- Cài freshness queue cho edit trực tiếp workbook Vận tải, có debounce/retry/structural full refresh.
- Supabase giữ report bundles; Google Sheets vẫn là nguồn tính toán chuẩn.

### 4.4. UI/UX, Supabase-first và schema drift — 2026-07-21 đến 2026-07-31

- Hoàn thành design system, shell/navigation và nâng cấp toàn bộ module.
- Sửa sticky table, export PNG, mobile bottom sheet/swipe, input zoom, numeric formatting và navigation performance.
- Audit schema drift workbook thật: bảng phụ trong `DM_*`, `NL_TaiXe` thêm `Dự án`, `NL_PhanCongLai`; write path chỉ tác động native business range và bảo toàn helper/formula.
- Đọc Dashboard/Report/Manage/Catalog/Cashflow chuyển Supabase-first/fail-closed; Apps Script chỉ live-read khi force refresh hoặc fallback có chủ đích.
- Thu chi có shared date range, pagination, optimistic writes và form khoản vay nhiều dòng.
- Sửa toàn vẹn `NHAP_VAY`: chỉ ghi A:K, bảo vệ `ARRAYFORMULA` N2 và dùng mã khoản vay 12 chữ số có lock/sequence.

### 4.5. Web Push, notification và environment guard — 2026-07-30 đến 2026-08-05

- Thêm push-only service worker, không có offline data cache.
- Migration `011–013` thêm subscription, rule state, preferences/config/audit server-only.
- iPhone Add to Home Screen và self-test đã được người dùng xác nhận.
- Rule cảnh báo số dư Quỹ dưới 10 triệu đã dry-run PASS; production cron/feature flag chưa bật.
- Environment Identity Guard khóa đúng app/Supabase/Vercel/Apps Script identities.
- Canary hai chiều Webapp → queue → Sheet → Supabase và Sheet → Supabase → Webapp PASS; filtered-row write có fallback từng ô bảo toàn công thức, delete Vận hành là clear-only.

### 4.6. Dashboard/Report production polish — 2026-08-05

- Dashboard/Report polish, unique physical vehicle count, date-serial recovery và quản lý xóa tài khoản đã promote production.
- Gate 462/462 tests, lint, typecheck, build, Identity Guard và smoke production PASS.
- Tài khoản `test` chưa bị xóa; đây là thao tác quản trị riêng.

## 5. Checkpoint gần nhất và trạng thái hiện tại

### Retirement `SYS_ReportCache` — hoàn thành 2026-08-08

Trạng thái: **RETIRED trên workbook; Preview runtime PASS; Production runtime chưa promote**.

- Runtime candidate chuẩn hóa mọi cấu hình cache cũ về Supabase-only.
- `SheetService` không còn đọc/ghi `SheetReportCacheRepository`; repository không thể tự tạo tab.
- Migration `ReportCacheRetirementMigration.gs` có dry-run, exact-version gate, backup, fingerprint, prepare, one-shot approval, guarded delete và restore có approval.
- Full gate PASS 467/467 tests, lint, typecheck, Next build, Identity Guard và `git diff --check` tại thời điểm checkpoint.
- Authenticated Preview audit 4/4 tháng và live-compute path PASS.
- Tab `SYS_ReportCache` đã được guarded delete lúc `2026-08-08T14:30:36.078Z`.
- Hậu kiểm trả `alreadyRetired=true`, runtime `supabase`, đủ 5 bundle `05/2026`–`08/2026` và `Tất cả` cùng `dataVersion=1786191065678`.
- Backup đã xác minh: file ID `1RDtqxA6HIl3wR9twjYPI6mchBe71whybhD0Lc4Ws960`, fingerprint `AJieHfnEU31ILBmD8EGyNp-vGDu06ANKkW_kgGJVDH4`.
- Không khôi phục tab trừ khi cần điều tra và có phê duyệt restore riêng.

## 6. Checkpoint tiếp theo đề xuất

Không có checkpoint code mới được tự động mở.

Thứ tự đề xuất:

1. **Hợp nhất repository/worktree hiện tại**: phân loại source/test/docs/dependency, chạy lại full gate và commit các checkpoint đã hoàn tất thành lịch sử Git rõ ràng.
2. **Theo dõi Preview retirement**: xác nhận Report normal read, force refresh/live-compute và không tái tạo `SYS_ReportCache`.
3. **Production promotion riêng**: chỉ sau phê duyệt mới deploy Apps Script/Vercel runtime retirement lên Production; không đổi production alias bằng lệnh thủ công.
4. **Cron cảnh báo Quỹ riêng**: chỉ khi có phê duyệt khác, kiểm tra recipient/subscription, tạo/rotate `CRON_SECRET`, bật feature flag và thêm lịch 08:00 Việt Nam.

## 7. Mục tiêu kiến trúc dài hạn

Definition of Done hiện giữ:

1. Next.js App Router là presentation duy nhất.
2. Server Components xử lý layout/auth/initial read khi phù hợp; Client Components chỉ giữ interaction/browser state.
3. Mọi module đi qua API contract thống nhất, không DOM bridge/global legacy.
4. Auth/RBAC được enforce ở Vercel và Apps Script boundary phù hợp.
5. Workbook/year context rõ cho mọi request.
6. Apps Script chỉ là API/integration/worker/sync.
7. Google Sheets tiếp tục là source of truth cho tới khi có migration kiến trúc riêng.
8. Supabase tiếp tục là Auth/read model/cache/queue, không âm thầm thành source of truth.
9. Build, lint, typecheck, tests, identity, RBAC và responsive QA là quality gates bắt buộc.
10. Mọi thay đổi production có candidate bất biến và rollback rõ.

## 8. Rủi ro và gate bắt buộc

1. Worktree phải được phân loại và commit trước checkpoint mới; không reset/xóa thay đổi chưa rõ nguồn.
2. Admin đã smoke production; operator/shareholder chưa có representative production smoke đầy đủ.
3. Authenticated visual/device QA không thể được thay thế hoàn toàn bằng unit/HTTP/DOM test.
4. Apps Script public deployment từng trả 403 dù UI permission đúng; health trực tiếp và identity fingerprint phải được kiểm tra sau deploy.
5. Client từng cài service worker legacy cần theo dõi riêng; service worker hiện tại không cache app/data.
6. iOS Web Push chỉ hoạt động với app Add to Home Screen và quyền được cấp từ thao tác người dùng.
7. Mọi thay đổi Google Sheet/Supabase schema phải có migration riêng; migration `001–013` đã chạy là bất biến, correction tiếp theo dùng `014+`.
8. Không đổi tên sheet, thứ tự cột, công thức hoặc helper range. Xóa Vận hành là clear-only.
9. Report parity phải dùng exact `source_data_version`, loại field volatile khỏi hash và kiểm tra đủ các tháng hiện hành cùng `Tất cả`.
10. Manual edit workbook Thu chi hoặc thay đổi chỉ lan qua `IMPORTRANGE` không được bảo đảm cùng SLA freshness với workbook Vận tải.
11. Rollback Apps Script dùng version còn lưu trên cùng production deployment ID; không dùng recovery deployment `@281` đã undeploy.
12. Production warning `DEP0169 url.parse()` có thể xuất hiện trên request HTTP 200; chưa có call site trực tiếp trong source.

## 9. Router tài liệu

| Tác vụ | Đọc thêm |
| --- | --- |
| Quy tắc/routing | `docs/ai/AI_START_HERE.md`, `docs/governance/DOCUMENTATION_POLICY.md` |
| Kiến trúc hiện tại | `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/MODULE_MAP.md`, `docs/architecture/DATA_FLOWS.md` |
| API/Auth/RBAC | `docs/contracts/API_CONTRACTS.md`, `docs/contracts/RBAC_MATRIX.md` |
| Google Sheet/schema/formula | `PROJECT_SCHEMA.md`, `docs/contracts/SPREADSHEET_CONTRACTS.md` |
| Supabase/cache/queue | `SUPABASE_SCHEMA.md`, migrations, `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md` |
| Thu chi bound script | `docs/legacy/THU_CHI_BOUND_SCRIPT.md` và source snapshot |
| Test/risk | `docs/quality/TEST_STRATEGY.md`, `docs/quality/KNOWN_RISKS.md` |
| Deploy/rollback | `WORKFLOW.md`, `ROLLBACK.md`, `SUPABASE_SETUP.md` |
| Kiến trúc đích | `TARGET_ARCHITECTURE.md` |
| Lịch sử | `CHANGELOG.md`, `NEXTJS_MIGRATION_PLAN.md`, `REFACTOR_PLAN.md`, `AUDIT_REPORT.md`, Git history |

## 10. Trạng thái tài liệu

- Loại: `CURRENT` living handoff.
- Owner: current state, timeline rút gọn, checkpoint gần nhất, checkpoint tiếp theo và gates.
- Không sở hữu: contract/schema/runbook chi tiết.
- Nguồn kiểm chứng: source, tests, migrations, deployment checkpoint và Git.
- Ngày hệ thống lại: 2026-08-10.
- Cập nhật khi: production/preview/checkpoint/architecture/source-of-truth/blocker thay đổi.
