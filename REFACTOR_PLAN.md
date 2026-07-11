# REFACTOR_PLAN

## 1. Mục đích và phạm vi

Đây là kế hoạch refactor được xây dựng từ `AUDIT_REPORT.md` cho hệ thống Vận tải Đông Bắc.

Mục tiêu của refactor:

- giảm kích thước và trách nhiệm của các god modules;
- làm rõ dependency và ownership;
- tăng khả năng kiểm thử;
- giảm coupling giữa domain, Google Sheets, Supabase và frontend;
- tạo nền tảng cho migration frontend trong tương lai;
- giữ nguyên toàn bộ hành vi nghiệp vụ và giao diện hiện tại.

Kế hoạch này không chứa code và không tự động cho phép triển khai bất kỳ bước nào.

## 2. Ràng buộc bắt buộc cho mọi bước

Mỗi bước trong tài liệu này phải đáp ứng:

1. Hoàn thành độc lập trong một change set riêng.
2. Có thể deploy ngay sau khi verification đạt.
3. Có thể rollback bằng revert commit/deployment trước.
4. Không đổi tên sheet, thứ tự cột, formula hoặc named range.
5. Không thay đổi nghiệp vụ.
6. Không thay đổi giao diện hoặc luồng thao tác người dùng.
7. Không thay đổi public API contract ngoài compatibility wrapper giữ nguyên.
8. Không thay đổi direct/queue semantics.
9. Không thay source of truth.
10. Không chạy migration Google Sheet trừ khi có kế hoạch riêng được duyệt.
11. Không gộp cleanup không liên quan vào cùng diff.
12. Có characterization test trước hoặc trong cùng bước.
13. Deploy theo cơ chế hiện hành, không buộc cutover toàn hệ thống.

Nếu một bước không thể thỏa tất cả điều kiện trên, bước đó phải được chia nhỏ trước khi thực hiện.

## 3. Chiến lược triển khai chung

### 3.1. Mô hình strangler nội bộ

Không rewrite module lớn trong một lần. Với mỗi phần được tách:

1. Giữ public function/facade cũ.
2. Tạo implementation mới có cùng input/output.
3. Cho facade cũ delegate sang implementation mới.
4. Chạy cùng test contract.
5. Deploy.
6. Chỉ xóa implementation cũ khi không còn call site và đã qua một vòng ổn định riêng.

### 3.2. Một bước, một loại thay đổi

Không trộn trong cùng bước:

- backend extraction và frontend rewrite;
- refactor và feature mới;
- refactor và đổi schema;
- refactor và đổi role;
- refactor và year cutover;
- source move và dependency cleanup lớn;
- React migration và API redesign.

### 3.3. Compatibility-first

Trong toàn bộ kế hoạch:

- action names giữ nguyên;
- request/response shape giữ nguyên;
- cache key giữ nguyên;
- job payload/status giữ nguyên;
- HTML/DOM/CSS output giữ nguyên;
- Google Sheet write ranges giữ nguyên;
- feature flags giữ nguyên mặc định production.

## 4. Cổng kiểm soát trước mỗi bước

Trước khi bắt đầu bất kỳ bước nào:

1. Đọc `AGENTS.md`, `AI_START_HERE`, `PROJECT_CONTEXT` và contract liên quan.
2. Chạy `git status --short`.
3. Xác định commit/deployment production hiện tại.
4. Ghi baseline test.
5. Xác định file và public surface bị ảnh hưởng.
6. Xác định data/cache/queue/report side effects.
7. Viết rollback cụ thể.
8. Giải thích kế hoạch bằng tiếng Việt.
9. Chỉ sửa phạm vi của đúng một bước.

## 5. Tiêu chuẩn deploy và rollback chung

### 5.1. Verification tối thiểu

- `npm test` pass;
- `npm run build` pass nếu frontend source bị chạm;
- `git diff --check` pass;
- API contract/RBAC test liên quan pass;
- no-secret check;
- characterization output trước/sau giống nhau;
- Sheet formula/validation test nếu code write bị chạm;
- report golden comparison nếu report bị chạm;
- queue idempotency test nếu worker/job bị chạm.

### 5.2. Deploy

- Apps Script change: build frontend nếu cần, `clasp push`, deploy version mới, smoke test.
- Frontend change: build, commit/push, Vercel preview/production smoke.
- Supabase schema: chỉ migration mới và chỉ ở bước được duyệt riêng.
- Refactor thuần không tự động bật/tắt feature flag.

### 5.3. Rollback

Ưu tiên theo thứ tự:

1. Revert commit của đúng bước.
2. Redeploy Apps Script version trước hoặc Vercel deployment trước.
3. Giữ nguyên database/Sheet vì refactor không được đổi schema/data.
4. Nếu có compatibility flag nội bộ, chuyển về implementation cũ rồi redeploy.
5. Xác minh API/read/write/report trở lại baseline.

## 6. Danh sách thứ tự tổng hợp

| Bước | Hạng mục | Rủi ro |
| ---: | --- | --- |
| 01 | Baseline characterization manifest | Rất thấp |
| 02 | API/RBAC contract tests | Rất thấp |
| 03 | Cache-key parity tests | Rất thấp |
| 04 | Golden report fixtures | Thấp |
| 05 | Google Sheet write-preservation fixture | Thấp |
| 06 | Queue lifecycle/idempotency fixture | Thấp-trung bình |
| 07 | Tách pure normalization utilities backend | Thấp |
| 08 | Tách Supabase HTTP client | Thấp-trung bình |
| 09 | Tách Supabase bundle/status repositories | Thấp-trung bình |
| 10 | Tách cache audit service | Thấp-trung bình |
| 11 | Tách runtime cache helpers khỏi SheetService | Thấp-trung bình |
| 12 | Tách Sheet write-preservation helpers | Trung bình |
| 13 | Làm thật Transport Catalog facade | Trung bình |
| 14 | Làm thật Transport Read/Manage facade | Trung bình |
| 15 | Làm thật Transport Entry facade | Trung bình |
| 16 | Tách Transport Reconciliation service | Trung bình |
| 17 | Tách report temp-sheet/cache infrastructure | Trung bình-cao |
| 18 | Tách report parsing/dashboard services | Cao |
| 19 | Tách Supabase sync services theo module | Trung bình-cao |
| 20 | Tách write-job repository | Trung bình-cao |
| 21 | Tách worker và job handlers | Cao |
| 22 | Tách Fund transaction service/repository | Cao |
| 23 | Tách Fund catalog service/repository | Cao |
| 24 | Tách Fund loan service/repository | Cao |
| 25 | Chuẩn hóa API command/query registry nội bộ | Cao |
| 26 | Tách Vercel proxy services | Trung bình-cao |
| 27 | Tách frontend utility/API/Auth layers | Cao |
| 28 | Tách frontend observability module | Cao |
| 29 | Tách Cashflow thành submodules vanilla | Cao |
| 30 | Tách frontend shared pending-job store | Cao |
| 31 | Migrate Accounts sang React/Next.js | Cao |
| 32 | Migrate Sync Status/Audit sang React/Next.js | Cao |
| 33 | Migrate Catalog sang React/Next.js | Cao |
| 34 | Migrate Reports/Dashboard sang React/Next.js | Rất cao |
| 35 | Migrate Entry/Manage sang React/Next.js | Rất cao |
| 36 | Migrate Cashflow sang React/Next.js | Rất cao |

## 7. Bước 01 — Baseline characterization manifest

Rủi ro: rất thấp.

Mục tiêu:

- ghi nhận behavior/output baseline trước refactor;
- không thay production runtime.

Phạm vi:

- thêm test/fixture manifest cho public action, source file, cache key, feature flag;
- snapshot structural metadata, không snapshot secret/data nhạy cảm.

Không thay đổi:

- code nghiệp vụ;
- API;
- UI;
- Google Sheets/Supabase.

Verification:

- manifest được sinh/kiểm tra deterministic;
- test hiện tại pass;
- không chứa credential hoặc production payload cá nhân.

Deploy:

- có thể deploy cùng source vì chỉ thêm test/fixture không runtime.

Rollback:

- revert file test/fixture.

Điều kiện hoàn tất:

- có danh sách machine-checkable của action/module/key quan trọng.

## 8. Bước 02 — API và RBAC contract tests

Rủi ro: rất thấp.

Mục tiêu:

- phát hiện drift giữa frontend call sites, proxy, Router và `invokeApi`;
- khóa permission hiện tại.

Phạm vi:

- test registry action/method;
- test shareholder allowlist;
- test account admin-only;
- test write action không dùng GET.

Không thay runtime permission hoặc action.

Verification:

- test fail nếu frontend gọi action không có handler;
- test fail nếu shareholder được mở write action;
- test fail nếu operator được mở account admin.

Deploy:

- test-only, không đổi runtime.

Rollback:

- revert test commit.

## 9. Bước 03 — Cache-key parity tests

Rủi ro: rất thấp.

Mục tiêu:

- khóa quy ước key giữa backend và frontend.

Phạm vi test:

- report month/dashboard key;
- catalog form/display key;
- fund options/catalog key;
- manage `recent_500`/`month:YYYY-MM`;
- fund transactions key.

Không đổi helper/key production.

Verification:

- cùng input tạo cùng logical key;
- test các ký tự Unicode/empty/latest.

Deploy/rollback:

- test-only; revert độc lập.

## 10. Bước 04 — Golden report fixtures

Rủi ro: thấp.

Mục tiêu:

- tạo safety net trước khi tách report subsystem.

Phạm vi:

- fixture đã được đối soát cho `05/2026`, `06/2026`, `07/2026`, `Tất cả`;
- headers, labels, KPI, detail, payroll, vehicle summary;
- sanitizer bỏ timestamps volatile.

Không sửa report code hoặc Sheet.

Verification:

- fixture khớp source Google Sheet đã xác nhận;
- test phát hiện `khối lượng` bị match thành payroll;
- test phát hiện bundle tháng bị lặp.

Deploy:

- test/fixture only.

Rollback:

- revert fixture/test.

## 11. Bước 05 — Google Sheet write-preservation fixture

Rủi ro: thấp.

Mục tiêu:

- khóa behavior formula/format/validation trước khi tách Sheet services.

Phạm vi:

- workbook bản sao test;
- append/update/clear cho sáu `NL_*`;
- transaction/loan fixture tối thiểu;
- formula snapshot trước/sau.

Không chạy write trên production.

Verification:

- header/order/formula/validation giữ nguyên;
- partial update không clear field khác;
- physical delete không được queue;
- test data cleanup thành công.

Deploy:

- test harness không nằm trong runtime path hoặc mặc định disabled.

Rollback:

- revert harness; xóa workbook test nếu cần.

## 12. Bước 06 — Queue lifecycle và idempotency fixture

Rủi ro: thấp-trung bình.

Mục tiêu:

- khóa behavior queue trước khi tách worker.

Phạm vi:

- enqueue duplicate;
- atomic claim;
- stale reclaim;
- max attempts;
- transport metadata replay;
- fund voucher full replay/partial conflict;
- failure after Sheet write.

Không đổi queue schema hoặc worker.

Verification:

- không ghi trùng;
- đúng transitions/logs;
- pending không thành business success;
- synced result giữ shape.

Deploy:

- tests dùng environment test.

Rollback:

- revert test harness và cleanup jobs test.

## 13. Bước 07 — Tách pure normalization utilities backend

Rủi ro: thấp.

Mục tiêu:

- giảm helper lặp cho date/number/month/text mà không đổi behavior.

Phạm vi một change set nhỏ:

- chọn một nhóm pure helper có behavior trùng rõ;
- tạo utility namespace/file;
- giữ wrapper tên cũ tại call site nếu cần.

Không làm trong cùng bước:

- thay thuật toán parse;
- sửa timezone;
- đổi format output;
- chuyển tất cả helpers hàng loạt.

Verification:

- characterization cases trước/sau bằng nhau;
- Vietnamese number/date cases;
- report/fund month keys không đổi.

Deploy:

- Apps Script version mới, smoke read-only.

Rollback:

- revert utility extraction; không có data migration.

## 14. Bước 08 — Tách Supabase HTTP client

Rủi ro: thấp-trung bình.

Mục tiêu:

- cô lập REST/RPC transport khỏi sync/worker logic.

Phạm vi:

- move `readRows_`, `insertRows_`, `updateRows_`, `upsertRows_`, `callRpc_` và config/header/error handling sang `SupabaseHttpClient`;
- giữ signatures/response/error text tương thích.

Không đổi:

- table names;
- query syntax;
- service role config;
- retry/job behavior.

Verification:

- HTTP request snapshots trước/sau giống nhau;
- non-2xx/invalid JSON behavior giống;
- sync/worker smoke pass.

Deploy:

- deploy Apps Script; không migration.

Rollback:

- revert commit/deploy version trước.

## 15. Bước 09 — Tách BundleRepository và SyncStatusRepository

Rủi ro: thấp-trung bình.

Mục tiêu:

- tách persistence của cache/status khỏi orchestration.

Phạm vi:

- repository upsert/read bundle;
- repository ghi/đọc `sync_status`;
- giữ các public sync functions trong `SupabaseService`.

Không đổi:

- schema/table/primary key;
- payload shape;
- sync scope.

Verification:

- same upsert rows;
- same status keys/timestamps;
- cache audit/read frontend pass.

Deploy/rollback:

- Apps Script deploy; revert độc lập, không migration.

## 16. Bước 10 — Tách CacheAuditService

Rủi ro: thấp-trung bình.

Mục tiêu:

- cô lập normalize/hash/compare khỏi Supabase sync core.

Phạm vi:

- stable stringify;
- report/manage audit payload sanitization;
- hash comparison;
- audit result formatting.

Không đổi live read hoặc cache key.

Verification:

- existing audit cases identical;
- volatile field ignored;
- stale/missing/error results giữ shape.

Deploy/rollback:

- deploy Apps Script; revert file/delegation.

## 17. Bước 11 — Tách runtime cache helpers khỏi SheetService

Rủi ro: thấp-trung bình.

Mục tiêu:

- cô lập `CacheService`/chunked cache/version operations.

Phạm vi:

- `putChunkedCache_`, `getChunkedCache_`, `removeChunkedCache_`;
- cache key/version/invalidation primitives;
- giữ public invalidation behavior.

Không đổi TTL/key/version values.

Verification:

- chunk splitting/reassembly;
- old chunks cleanup;
- invalidation output;
- dashboard/report fallback unchanged.

Deploy/rollback:

- Apps Script deploy; revert độc lập.

## 18. Bước 12 — Tách SheetWritePreserver

Rủi ro: trung bình.

Mục tiêu:

- gom low-level write logic bảo toàn công thức/format.

Phạm vi:

- row segment write;
- formula skip map;
- ensure rows;
- copy template format/formula;
- last non-empty row helper.

Không đổi mapping form/header/append logic ở bước này.

Verification:

- Sheet-copy integration fixture pass;
- formula/validation/typed columns giữ nguyên;
- append row/range giống baseline.

Deploy:

- Apps Script version mới;
- smoke một read và một write test được phê duyệt hoặc test copy.

Rollback:

- redeploy version trước; dữ liệu không cần migrate.

## 19. Bước 13 — Làm thật TransportCatalogService facade

Rủi ro: trung bình.

Mục tiêu:

- chuyển implementation catalog ra khỏi `SheetService` sau boundary hiện có.

Phạm vi:

- catalog needs/read;
- catalog display read;
- virtual `DM_ThamSo` mapping;
- giữ generic write path hiện tại nếu chưa đủ test.

Không đổi response/catalog keys/UI.

Verification:

- response fixtures từng form;
- display sheets TS/GD;
- cache sync sau catalog write;
- frontend forms/catalog view unchanged.

Deploy/rollback:

- facade giữ tên public; revert delegation.

## 20. Bước 14 — Làm thật Transport Read/Manage facade

Rủi ro: trung bình.

Mục tiêu:

- chuyển generic/manage read khỏi `SheetService`.

Phạm vi:

- header/date range/limit reads;
- row serialization;
- recent/manage response.

Không chuyển update/delete trong bước này.

Verification:

- six `NL_*` read fixtures;
- date filters/limit/order/rowIndex;
- Supabase fallback behavior;
- shareholder read path.

Deploy/rollback:

- `ManageService`/`SheetReadService` public signatures giữ nguyên; revert implementation.

## 21. Bước 15 — Làm thật TransportEntryService facade

Rủi ro: trung bình.

Mục tiêu:

- chuyển submit logic sau `EntryService` boundary.

Phạm vi:

- catalog lookup for validation;
- `ValidationService.buildRows` call;
- append-row orchestration;
- write context/metadata integration;
- cache invalidation callback giữ nguyên.

Không chuyển generic save/delete trong cùng bước.

Verification:

- six form integration cases;
- warnings/errors/result shape;
- queued idempotent replay;
- formula preservation.

Deploy/rollback:

- `EntryService.submitRows` giữ signature; revert delegation/version.

## 22. Bước 16 — Tách TransportReconciliationService

Rủi ro: trung bình.

Mục tiêu:

- cô lập reconciliation khỏi Sheet core.

Phạm vi:

- read/aggregate trip pairs;
- compare submitted rows;
- response warning formatting.

Không đổi Sheet formula `XL_DoiSoatChuyen` hoặc business thresholds.

Verification:

- matched/missing/excess cases;
- same response/order/messages;
- shareholder read-only permission unchanged.

Deploy/rollback:

- facade action giữ nguyên; revert service extraction.

## 23. Bước 17 — Tách report temp-sheet và Sheet cache infrastructure

Rủi ro: trung bình-cao.

Điều kiện tiên quyết: golden reports và temp-sheet tests đã tồn tại.

Mục tiêu:

- cô lập technical report infrastructure trước parser.

Phạm vi:

- `ReportTempSheetService`;
- `SheetReportCacheRepository` cho `SYS_ReportCache`;
- cleanup patterns;
- version/read/write cache.

Không đổi report parsing/output/controller semantics.

Verification:

- `BC_TongQuan!B1` gốc không đổi;
- temp sheet unique/cleanup;
- cache hit/miss/version;
- golden output identical.

Deploy:

- Apps Script deploy; report read smoke cho các kỳ.

Rollback:

- deploy version trước; cleanup temp sheets nếu execution lỗi.

## 24. Bước 18 — Tách report parsing và DashboardService

Rủi ro: cao.

Điều kiện tiên quyết: golden fixtures pass.

Mục tiêu:

- chia `SheetService` report domain thành implementation rõ.

Phạm vi nên tách thành change set nhỏ; bước này chỉ hoàn tất một slice mỗi lần:

- overview month resolution;
- KPI parsing;
- detail parsing/aggregation;
- report tables;
- dashboard/latest trips.

Nếu diff vượt một slice, chia thành Bước 18a/18b độc lập.

Không đổi matrix/labels/formulas/UI.

Verification:

- golden months + `Tất cả`;
- report audit hashes;
- export/render smoke;
- no controller mutation.

Deploy/rollback:

- giữ `ReportService` facade; revert đúng slice.

## 25. Bước 19 — Tách Supabase sync services theo module

Rủi ro: trung bình-cao.

Mục tiêu:

- tách report/manage/fund/startup sync khỏi `SupabaseService` monolith.

Thực hiện từng module độc lập:

1. `StartupCatalogSyncService`;
2. `ReportSyncService`;
3. `ManageSyncService`;
4. `FundSyncService`.

Mỗi module là một deploy/revert riêng; không chuyển cả bốn cùng lúc.

Không đổi cache keys/payload/sync scopes.

Verification:

- same upsert rows/status keys;
- same after-write month selection;
- audit pass;
- tick/full sync public functions unchanged.

Rollback:

- facade `SupabaseService` delegate về implementation cũ hoặc revert đúng module.

## 26. Bước 20 — Tách WriteJobRepository

Rủi ro: trung bình-cao.

Mục tiêu:

- cô lập enqueue/read/retry/job-log persistence.

Phạm vi:

- insert/idempotency lookup;
- get job/recent jobs;
- retry update;
- job/log status updates;
- normalize row.

Không đổi RPC claim/worker execution trong bước này.

Verification:

- job response identical;
- duplicate enqueue;
- retry behavior;
- frontend polling/history.

Deploy/rollback:

- no migration; revert repository delegation.

## 27. Bước 21 — Tách WriteJobWorker và handlers

Rủi ro: cao.

Điều kiện tiên quyết: queue lifecycle/idempotency fixture pass.

Mục tiêu:

- tách atomic claim/lifecycle khỏi action execution;
- tách transport/fund handlers.

Phạm vi chia nhỏ:

- 21a: worker claim/lifecycle wrapper;
- 21b: `TransportJobHandler`;
- 21c: `FundJobHandler`.

Mỗi substep deploy độc lập.

Không đổi job schema/status/payload/result/attempt semantics.

Verification:

- atomic concurrency;
- stale replay;
- failure after Sheet write;
- cache sync scopes;
- production worker idle smoke.

Rollback:

- redeploy previous Apps Script version; không sửa job rows bằng tay trừ incident runbook.

## 28. Bước 22 — Tách FundTransactionRepository/Service

Rủi ro: cao.

Mục tiêu:

- cô lập transaction read/write/voucher/batch rollback.

Phạm vi:

- header lookup/read;
- transaction mapping;
- validate/build row;
- append/update/delete;
- voucher lookup/replay;
- batch rollback.

Không chuyển overview/loan/catalog trong cùng bước.

Verification:

- direct and queued add;
- stable voucher;
- partial conflict;
- formula/helper preservation;
- result spreadsheet/sheet/range identical;
- fund cache after write.

Rollback:

- `FundService` facade giữ public functions; revert delegate/deploy version.

## 29. Bước 23 — Tách FundCatalogRepository/Service

Rủi ro: cao.

Mục tiêu:

- cô lập named/native ranges và catalog rules.

Phạm vi:

- read options/groups;
- encoded row index;
- bounds/append;
- fallback values;
- catalog CRUD.

Không đổi named ranges/vùng/copy Sheet.

Verification:

- all groups/options;
- out-of-range rejection;
- no overflow;
- cache keys/payload unchanged.

Deploy/rollback:

- facade giữ API; revert service extraction.

## 30. Bước 24 — Tách FundLoanRepository/Service

Rủi ro: cao.

Điều kiện tiên quyết: full loan characterization tests.

Mục tiêu:

- cô lập loan persistence và reconciliation domain.

Phạm vi:

- read/write loan rows;
- loan state aggregation;
- exact/orphan reconciliation;
- historical outstanding;
- add loan/payment.

Không đổi mã/formula/UI columns/rules.

Verification:

- exact match;
- safe orphan match;
- ambiguous/no-balance match rejected;
- partial/full settlement;
- interest behavior;
- current/historical month output.

Rollback:

- `FundService` public facade; redeploy version trước.

## 31. Bước 25 — Chuẩn hóa API command/query registry nội bộ

Rủi ro: cao.

Mục tiêu:

- tạo single internal registry cho method, handler, permission class và kind.

Phạm vi ban đầu:

- registry nội bộ dùng bởi tests/dispatcher;
- compatibility giữ `action` API cũ;
- không đổi URL/payload.

Không chuyển resource URLs hoặc frontend calls trong bước này.

Verification:

- toàn bộ current actions route giống baseline;
- shareholder/admin/operator permissions giống;
- direct/proxy paths giống;
- invalid method/action messages tương thích.

Deploy/rollback:

- giữ dispatcher cũ dưới compatibility flag hoặc revert commit.

## 32. Bước 26 — Tách Vercel proxy services

Rủi ro: trung bình-cao.

Mục tiêu:

- chia `api/app.js` mà không đổi endpoint.

Thứ tự độc lập:

1. `AppsScriptClient`;
2. `AuthorizationPolicy`;
3. `AuthService`/`AppUserRepository`;
4. `AccountService`.

Mỗi phần deploy riêng.

Không đổi `/api/app`, HTTP status, body hoặc session behavior.

Verification:

- full RBAC matrix;
- account CRUD/password;
- upstream error mapping;
- no-secret logging;
- production read-only smoke.

Rollback:

- Vercel rollback/revert; Apps Script/Supabase không đổi.

## 33. Bước 27 — Tách frontend utility/API/Auth layers

Rủi ro: cao.

Mục tiêu:

- giảm global coupling nhưng giữ exact DOM/UI.

Thực hiện từng slice:

- pure date/money/HTML utilities;
- API transport client;
- Supabase cache client;
- Auth client/session;
- config constants tách mutable state.

Không đổi markup/CSS/text/interaction.

Verification:

- built HTML behavior parity;
- Auth/RBAC;
- Supabase fallback;
- desktop/mobile visual comparison;
- no console errors.

Deploy/rollback:

- build/deploy Vercel; rollback deployment trước.

## 34. Bước 28 — Tách frontend observability module

Rủi ro: cao.

Mục tiêu:

- tách sync status/audit/job rendering khỏi generic `client_ui`.

Phạm vi:

- giữ DOM IDs/markup/output;
- move functions/state ownership;
- generic toast/loader/date utilities giữ riêng.

Verification:

- status default không chạy heavy audit;
- quick/deep/all audit;
- retry job;
- exact UI screenshot parity.

Deploy/rollback:

- frontend build/Vercel; revert fragment/include change.

## 35. Bước 29 — Tách Cashflow thành submodules vanilla

Rủi ro: cao.

Mục tiêu:

- chia `client_cashflow.html` trước framework migration.

Tách từng file độc lập:

1. overview/report;
2. transactions/entry;
3. pending fund jobs;
4. loans;
5. fund catalog.

Mỗi slice giữ functions/global API cũ qua wrapper.

Không đổi HTML/CSS/text/business behavior.

Verification:

- full cashflow manual regression;
- pending excluded from KPI;
- transaction/loan/catalog API calls identical;
- mobile drawer parity.

Deploy/rollback:

- build/deploy; rollback Vercel commit từng slice.

## 36. Bước 30 — Tách frontend shared pending-job store

Rủi ro: cao.

Mục tiêu:

- tạo owner duy nhất cho transport/fund pending state.

Phạm vi:

- store/read/update/remove job;
- restore recent jobs;
- subscribe/render callbacks;
- giữ arrays/wrappers cũ trong transition.

Không đổi polling intervals/status labels/overlay rules.

Verification:

- reload restore;
- pending/processing/failed overlay;
- synced not overlaid;
- dashboard/manage/fund parity.

Deploy/rollback:

- frontend deploy; revert store/wrappers.

## 37. Bước 31 — React/Next.js Accounts vertical slice

Rủi ro: cao.

Điều kiện tiên quyết:

- typed/stable account API client;
- RBAC tests;
- Next.js shell có thể chạy song song.

Mục tiêu:

- migrate Accounts đầu tiên vì boundary rõ.

No-UI-change requirement:

- markup, labels, validation, spacing và behavior phải được visual-regression đối chiếu;
- route/menu hiện tại giữ nguyên;
- có feature flag để chọn legacy hoặc React implementation.

Deploy:

- legacy implementation vẫn tồn tại;
- enable cho internal/admin canary trước, sau đó production.

Rollback:

- tắt flag/quay lại legacy component hoặc Vercel rollback.

## 38. Bước 32 — React/Next.js Sync Status/Audit slice

Rủi ro: cao.

Mục tiêu:

- migrate observability feature độc lập.

Ràng buộc:

- exact API calls/params;
- default view không chạy audit nặng;
- UI parity;
- legacy fallback bằng flag.

Verification:

- status/jobs/audit/retry;
- admin/operator permissions;
- mobile/desktop screenshots.

Deploy/rollback:

- canary/flag; switch về legacy ngay nếu lỗi.

## 39. Bước 33 — React/Next.js Catalog slice

Rủi ro: cao.

Thứ tự độc lập:

1. read-only Catalog table;
2. filter/pagination;
3. edit/add/delete Vận tải;
4. Fund Catalog riêng.

Không migrate write ngay trong read slice.

Ràng buộc:

- dynamic headers/virtual sheets giữ nguyên;
- API/rowIndex behavior giữ nguyên;
- UI parity/feature flag.

Rollback:

- route/component flag về legacy; backend không đổi.

## 40. Bước 34 — React/Next.js Reports và Dashboard

Rủi ro: rất cao.

Điều kiện tiên quyết:

- golden report fixtures;
- visual regression;
- stable report API/cache client.

Tách thành hai deploy độc lập:

- Dashboard;
- Reports.

Không đổi:

- matrix/labels/subtotals;
- chart values;
- export CSV/image;
- pending latest-trip behavior;
- sticky/responsive UI.

Deploy:

- read-only canary bằng feature flag.

Rollback:

- switch về legacy viewer; không cần backend/data rollback.

## 41. Bước 35 — React/Next.js Entry và Manage

Rủi ro: rất cao.

Điều kiện tiên quyết:

- stable pending-job store;
- typed write API;
- Sheet write/idempotency tests;
- React read-only tables đã ổn định.

Tách thành nhiều vertical slices:

1. Manage read-only;
2. Manage filter/pagination;
3. Entry form read/render;
4. Entry submit queue;
5. Manage edit;
6. Manage clear/delete.

Mỗi slice độc lập/flagged/rollback được.

No-UI/business-change:

- exact form fields/validation/messages;
- optimistic rows/status;
- mobile card/table behavior;
- row identity/concurrency.

Rollback:

- feature flag về legacy view; backend/API giữ nguyên.

## 42. Bước 36 — React/Next.js Cashflow

Rủi ro: rất cao nhất.

Điều kiện tiên quyết:

- Cashflow vanilla đã tách submodules;
- transaction/loan/catalog services và tests ổn định;
- pending fund store ổn định.

Tách theo thứ tự:

1. Overview read-only;
2. Transaction list;
3. Transaction entry/edit;
4. Loan overview/history;
5. Loan add/payment;
6. Fund catalog.

Mỗi submodule có legacy fallback riêng.

Verification:

- KPI/category/growth exact;
- pending excluded;
- voucher/idempotency;
- loan reconciliation/historical outstanding;
- catalog bounds;
- mobile drawers;
- UI visual parity.

Rollback:

- disable từng submodule flag hoặc rollback Vercel; backend/Sheet không đổi.

## 43. Các hạng mục cố ý không nằm trong kế hoạch refactor này

Các việc sau thay đổi kiến trúc/nghiệp vụ/vận hành và cần project riêng:

- chuyển source of truth từ Google Sheets sang Supabase;
- normalize toàn bộ business data vào PostgreSQL;
- bỏ Apps Script;
- bỏ Google Sheets;
- thay công thức bằng code;
- đổi schema/header/sheet names;
- hợp nhất Vận tải và Thu chi;
- đổi UI/UX;
- thêm feature;
- đổi role model;
- queue physical delete;
- year cutover 2027;
- thay bound script Thu chi;
- repository cleanup lớn như xóa tracked `node_modules` trong cùng refactor.

## 44. Quy tắc chia nhỏ nếu bước vượt phạm vi

Một bước phải bị chia nhỏ khi có một trong các dấu hiệu:

- chạm hơn một bounded context;
- đổi cả backend và frontend không cần thiết;
- thay hơn một public contract;
- cần migration;
- không thể mô tả rollback bằng một revert/deploy;
- verification cần nhiều loại dữ liệu production;
- diff cơ học che lấp logic;
- deploy buộc dừng hệ thống;
- cần đổi UI/behavior để hoàn thành.

Mẫu chia:

```text
Characterization test
→ create new implementation unused
→ delegate one public function
→ migrate remaining functions one-by-one
→ remove old implementation in later step
```

## 45. Mẫu checklist thực thi cho từng bước

### Trước code

- [ ] Bước được người dùng phê duyệt.
- [ ] Scope chỉ một change set.
- [ ] Baseline tests pass.
- [ ] Public contract được ghi.
- [ ] Rollback cụ thể.
- [ ] Không có unrelated worktree overlap.

### Trong code

- [ ] Không đổi business condition.
- [ ] Không đổi UI text/DOM/CSS.
- [ ] Không đổi Sheet schema/formula.
- [ ] Không đổi API/cache/job keys.
- [ ] Facade/compatibility giữ nguyên.
- [ ] Test characterization được giữ/mở rộng.

### Trước deploy

- [ ] `npm test` pass.
- [ ] Build pass nếu cần.
- [ ] Integration/golden/RBAC tests phù hợp pass.
- [ ] Diff được review theo module map.
- [ ] Rollback artifact/version sẵn sàng.

### Sau deploy

- [ ] Health/Auth pass.
- [ ] Representative read pass.
- [ ] Representative write chỉ khi được phê duyệt.
- [ ] Queue/cache/report status bình thường.
- [ ] Không console/execution errors mới.
- [ ] Handoff ghi rõ verification và version.

## 46. Tiêu chí kết thúc toàn bộ chương trình refactor

Chương trình chỉ được coi là hoàn tất khi:

- `SheetService`, `SupabaseService`, `FundService` không còn god-module responsibility;
- facade sở hữu implementation thật;
- API/permission registry có nguồn duy nhất;
- domain logic được test độc lập khỏi I/O khi khả thi;
- Sheet formula/report contracts có regression tests;
- queue idempotency có runtime tests;
- frontend dependency/state ownership rõ;
- migration React/Next nếu thực hiện có legacy rollback đến khi ổn định;
- production behavior/UI/business không đổi qua từng step;
- documentation/module map được cập nhật sau mỗi boundary change.

## 47. Trạng thái tài liệu

- Phase: 3 — Refactor Planning.
- Nguồn: `docs/ai/AI_START_HERE.md`, `PROJECT_CONTEXT.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `AUDIT_REPORT.md`.
- Lưu ý tên: `AI.md` và `ARCHITECTURE.md` không tồn tại; đã dùng hai tài liệu chuẩn tương đương ở trên.
- Loại thay đổi hiện tại: chỉ tạo kế hoạch.
- Code/schema/UI/business changes: không thực hiện.
- Thứ tự: từ rủi ro thấp nhất đến cao nhất.
- Mỗi bước: độc lập, deploy được và rollback được theo contract mô tả.
- Ngày lập: 2026-07-11.
