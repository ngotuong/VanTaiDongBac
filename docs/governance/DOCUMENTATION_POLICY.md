# DOCUMENTATION_POLICY

## 1. Mục đích và phạm vi

Tài liệu này quy định cách tạo, duy trì và sử dụng tài liệu kỹ thuật của dự án Vận tải Đông Bắc để con người và Coding Agent có thể cộng tác lâu dài.

Mục tiêu:

- xác định nguồn thông tin có thẩm quyền cho từng chủ đề;
- tránh tài liệu trùng lặp hoặc mâu thuẫn;
- phân biệt trạng thái hiện tại, contract, runbook và lịch sử;
- quy định khi nào thay đổi code/schema phải cập nhật tài liệu;
- giúp phát hiện và xử lý tài liệu stale;
- tạo cấu trúc handoff ổn định giữa các phiên làm việc;
- không để `PROJECT_CONTEXT.md` trở thành nơi chứa mọi loại thông tin.

Chính sách áp dụng cho tất cả file Markdown, schema snapshot, ADR và tài liệu vận hành trong repository.

## 2. Nguyên tắc tài liệu

1. Source code và migration đang có là bằng chứng về implementation hiện tại.
2. Tài liệu contract giải thích ý nghĩa và invariant mà source riêng lẻ không thể hiện đầy đủ.
3. Không copy cùng một bảng contract sang nhiều file nếu có thể link đến nguồn chuẩn.
4. Trạng thái hiện tại phải tách khỏi lịch sử thay đổi.
5. Tài liệu phải ghi phạm vi, nguồn kiểm chứng và ngày xác nhận.
6. Nội dung chưa xác minh phải được gắn nhãn rõ.
7. Không đưa secret, password, token hoặc credential vào tài liệu.
8. Không ghi dữ liệu cá nhân thật nếu không cần thiết.
9. Tài liệu phải dùng đường dẫn repository ổn định, không phụ thuộc máy cá nhân.
10. Thay đổi kiến trúc/schema/API phải cập nhật tài liệu trong cùng change set khi phạm vi cho phép.
11. Tài liệu không được dùng để hợp thức hóa implementation sai; mâu thuẫn phải được nêu và xác minh.
12. Tài liệu dành cho AI phải ưu tiên invariant, ownership, side effect và checklist hơn diễn giải chung chung.

## 3. Phân loại tài liệu

### 3.1. Entry point và governance

Mục đích: quy định Agent bắt đầu ở đâu và cách tài liệu được quản lý.

Files:

- `AGENTS.md`;
- `docs/ai/AI_START_HERE.md`;
- `docs/governance/DOCUMENTATION_POLICY.md`.

### 3.2. Living context/roadmap

Mục đích: handoff trạng thái hiện tại, deployment gần nhất, quyết định chưa hoàn tất và bước tiếp theo.

File:

- `PROJECT_CONTEXT.md`.

Living context không phải nơi định nghĩa chi tiết API/schema/module. Nó link đến tài liệu chuẩn tương ứng.

### 3.3. Architecture

Mục đích: mô tả thành phần, boundary, module và luồng dữ liệu hiện tại.

Files:

- `docs/architecture/SYSTEM_ARCHITECTURE.md`;
- `docs/architecture/MODULE_MAP.md`;
- `docs/architecture/DATA_FLOWS.md`.

### 3.4. Contracts

Mục đích: định nghĩa interface và invariant không được phá.

Files:

- `docs/contracts/API_CONTRACTS.md`;
- `docs/contracts/SPREADSHEET_CONTRACTS.md`;
- `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md`;
- `docs/contracts/RBAC_MATRIX.md`.

### 3.5. Schema/reference

Mục đích: snapshot kỹ thuật chi tiết và mapping dữ liệu.

Files hiện có:

- `PROJECT_SCHEMA.md`;
- `SUPABASE_SCHEMA.md`;
- `docs/schema/*.json`;
- `supabase/migrations/*.sql`.

JSON snapshot là bằng chứng tại thời điểm export, không tự động là trạng thái production hiện tại.

### 3.6. Quality

Mục đích: risk register, chiến lược kiểm thử và tiêu chí chất lượng.

Files:

- `docs/quality/KNOWN_RISKS.md`;
- `docs/quality/TEST_STRATEGY.md`.

### 3.7. Legacy/boundary

Mục đích: mô tả source ngoài deployment chính hoặc execution context legacy.

File:

- `docs/legacy/THU_CHI_BOUND_SCRIPT.md`.

### 3.8. Operations

Mục đích: setup, deploy, trigger, sync, troubleshooting và rollback.

Files hiện có:

- `SUPABASE_SETUP.md`;
- `WORKFLOW.md`;
- `ROLLBACK.md`.

Các runbook chuyên biệt tương lai đặt trong `docs/operations/`.

### 3.9. Decisions/history

Mục đích: ghi lại tại sao quyết định kiến trúc được đưa ra và lịch sử thay đổi.

Files dự kiến:

- `docs/decisions/ADR_INDEX.md`;
- `docs/decisions/ADR-*.md`;
- `docs/CHANGELOG_ARCHITECTURE.md`.

ADR/history không thay thế current architecture contract.

## 4. Ma trận nguồn có thẩm quyền

| Chủ đề | Nguồn chuẩn ưu tiên | Nguồn hỗ trợ |
| --- | --- | --- |
| Quy tắc làm việc bắt buộc | `AGENTS.md` | `AI_START_HERE.md` |
| Thứ tự đọc cho Agent | `docs/ai/AI_START_HERE.md` | `AGENTS.md` |
| Trạng thái/roadmap hiện tại | `PROJECT_CONTEXT.md` | deployment tools/logs/source |
| Kiến trúc hệ thống | `SYSTEM_ARCHITECTURE.md` | source code |
| Ownership/module | `MODULE_MAP.md` | source/call sites |
| Luồng dữ liệu | `DATA_FLOWS.md` | source/service/frontend |
| API action/method/permission | `API_CONTRACTS.md` + source | `Router.gs`, `PublicApi.gs`, `api/app.js` |
| Cấu trúc Google Sheets | `SPREADSHEET_CONTRACTS.md` + live Sheet | schema JSON, `PROJECT_SCHEMA.md` |
| Supabase cache/queue | `CACHE_AND_QUEUE_CONTRACTS.md` + migrations | `SUPABASE_SCHEMA.md`, `SupabaseService.gs` |
| Auth/RBAC | `RBAC_MATRIX.md` + proxy/RLS source | migrations/tests |
| Bound script Thu chi | live bound project sau xác minh | snapshot + `THU_CHI_BOUND_SCRIPT.md` |
| Risk | `KNOWN_RISKS.md` | incidents/context |
| Test expectations | `TEST_STRATEGY.md` | test source/workflow |
| Supabase DB schema thực thi | migrations đã apply | `SUPABASE_SCHEMA.md` |
| Deploy/rollback | `WORKFLOW.md`, `ROLLBACK.md` | `PROJECT_CONTEXT.md` |
| Lý do quyết định kiến trúc | ADR tương ứng | changelog/context |

“Nguồn chuẩn” không có nghĩa được tin mù quáng khi stale. Khi source/live state mâu thuẫn, phải ghi nhận discrepancy và xác minh.

## 5. Thứ tự ưu tiên khi có mâu thuẫn

1. Yêu cầu hiện tại rõ ràng của người dùng.
2. Quy tắc an toàn trong `AGENTS.md`.
3. Production/live state đã được xác minh.
4. Source code và migrations trong deployment hiện tại.
5. Contract docs đã xác nhận gần nhất.
6. Schema snapshot.
7. Living context/history.
8. Nhận định hoặc tài liệu cũ không có ngày xác nhận.

Khi phát hiện mâu thuẫn:

- không âm thầm sửa tài liệu hoặc code ngoài phạm vi;
- ghi rõ hai nguồn và hành vi khác nhau;
- xác định nguồn live nếu có quyền read-only;
- đề xuất file cần cập nhật;
- chỉ sửa theo phê duyệt.

## 6. Trạng thái tài liệu

Mỗi tài liệu kiến trúc/contract/quality/legacy phải có section `Trạng thái tài liệu` gồm tối thiểu:

- loại tài liệu;
- phạm vi;
- nguồn kiểm chứng;
- ngày xác nhận gần nhất;
- điều kiện cần cập nhật.

Nếu có uncertainty, thêm:

- trạng thái xác minh;
- môi trường/version được xác minh;
- phần chưa xác nhận.

### 6.1. Nhãn trạng thái cho nội dung

Sử dụng các nhãn khi cần:

- `CURRENT`: đã xác minh là hiện trạng;
- `REFERENCE SNAPSHOT`: ảnh chụp lịch sử/chưa xác minh live;
- `LEGACY`: còn tồn tại nhưng không phải đường chính;
- `DEPRECATED`: không được dùng cho development mới;
- `PROPOSED`: chưa được phê duyệt/triển khai;
- `UNKNOWN`: chưa đủ bằng chứng;
- `SUPERSEDED`: đã bị quyết định/tài liệu mới thay thế.

Không viết đề xuất như thể đã triển khai.

## 7. Quy tắc đặt tên và vị trí

### 7.1. Thư mục

```text
docs/
  ai/
  architecture/
  contracts/
  decisions/
  governance/
  legacy/
  operations/
  quality/
  schema/
  source/
```

### 7.2. Tên file

- Dùng uppercase snake case cho tài liệu chuẩn cấp dự án: `SYSTEM_ARCHITECTURE.md`.
- ADR dùng `ADR-NNN-SHORT-TITLE.md`.
- Không dùng tên chung như `notes.md`, `new.md`, `final.md`.
- Snapshot có timestamp/version trong filename.
- Không tạo `v2`, `final2`; dùng Git history và status metadata.

### 7.3. Ngôn ngữ

- Nội dung chính bằng tiếng Việt.
- Giữ nguyên tên file, function, action, table, sheet, header và key trong backticks.
- Thuật ngữ tiếng Anh kỹ thuật được dùng khi tránh dịch sai: source of truth, cache, queue, retry, idempotency, fallback.

## 8. Quy tắc link và tham chiếu

- Dùng relative path trong tài liệu repository.
- Link đến file chuẩn thay vì copy nguyên section dài.
- Khi tham chiếu source, ghi filename/function; line number chỉ dùng cho review ngắn vì dễ drift.
- Sheet/table/action dùng đúng case và dấu.
- Không dùng URL deployment làm nguồn contract duy nhất.
- Không đưa URL chứa token/query secret.

Ví dụ:

```markdown
Xem `docs/contracts/API_CONTRACTS.md` và `PublicApi.invokeApi()`.
```

## 9. Quy tắc không trùng lặp

### 9.1. Một chủ đề, một owner

- API matrix thuộc `API_CONTRACTS.md`.
- Role/action permission thuộc `RBAC_MATRIX.md`.
- Cache key/job lifecycle thuộc `CACHE_AND_QUEUE_CONTRACTS.md`.
- Sheet/header/formula invariant thuộc `SPREADSHEET_CONTRACTS.md`.
- Module/file ownership thuộc `MODULE_MAP.md`.
- Risk status thuộc `KNOWN_RISKS.md`.

Tài liệu khác chỉ tóm tắt và link.

### 9.2. Khi phải lặp

Chỉ lặp invariant Critical ở entry point/runbook nếu người đọc cần thấy ngay. Phần lặp phải ngắn và không tạo bảng chi tiết thứ hai.

### 9.3. Dấu hiệu duplication nguy hiểm

- cùng action có hai permission khác nhau;
- cùng sheet có hai header lists;
- cùng cache key được mô tả hai format;
- cùng deployment/version xuất hiện ở nhiều file living;
- cùng roadmap được copy vào README/WORKFLOW/context.

## 10. Vai trò của `PROJECT_CONTEXT.md`

`PROJECT_CONTEXT.md` chỉ nên giữ:

- mục tiêu sản phẩm hiện tại;
- nguyên tắc kiến trúc cấp cao;
- trạng thái hạ tầng/deployment gần nhất;
- feature flags/runtime state quan trọng;
- quyết định gần đây chưa được chuyển thành ADR;
- roadmap đang hoạt động;
- blocker và bước tiếp theo.

Không nên tiếp tục tích lũy vô hạn:

- danh sách đầy đủ API;
- schema chi tiết;
- mọi incident theo ngày;
- full deployment log;
- mọi UI tweak;
- bảng cache/queue contract.

Khi `docs/CHANGELOG_ARCHITECTURE.md` và ADR được tạo, lịch sử dài phải được chuyển/tóm tắt có kiểm soát, không xóa thông tin trước khi xác minh.

## 11. Vai trò của `PROJECT_SCHEMA.md`

`PROJECT_SCHEMA.md` hiện là tài liệu schema/kiến trúc lịch sử lớn và có phần stale.

Sau Phase chuẩn hóa, vai trò nên là:

- entry/reference map đến schema chi tiết;
- tổng hợp file/snapshot đang có;
- ghi known drift;
- link tới `SPREADSHEET_CONTRACTS.md`, `API_CONTRACTS.md`, `SYSTEM_ARCHITECTURE.md`.

Không cập nhật bằng cách tiếp tục chèn lịch sử không cấu trúc. Việc thu gọn/chỉnh vai trò là task riêng cần phê duyệt.

## 12. Vai trò của schema snapshots

### 12.1. Snapshot phải có metadata

- source spreadsheet name/ID nếu được phép lưu;
- generated/exported timestamp;
- timezone/locale;
- exporter/version;
- phạm vi export;
- checksum hoặc Git commit nếu có.

### 12.2. Snapshot là immutable evidence

Không sửa tay snapshot cũ để phản ánh production mới. Tạo snapshot mới có timestamp/version.

### 12.3. Không chứa dữ liệu không cần thiết

Raw snapshot có thể chứa sample data thực. Khi tạo snapshot mới phải cân nhắc:

- chỉ export schema/formula/validation;
- mask dữ liệu cá nhân;
- không export token/credential;
- tránh lưu dữ liệu tài chính chi tiết nếu không cần cho contract.

## 13. Vai trò của migrations

Migration SQL là lịch sử thực thi schema Supabase.

Rules:

- không sửa migration đã chạy;
- migration mới dùng số tiếp theo;
- file migration mô tả change, không thay thế schema docs;
- `SUPABASE_SCHEMA.md`/cache contract phải cập nhật sau migration;
- rollout order và rollback ghi ở operations docs/context;
- trạng thái remote applied phải được xác minh bằng tooling khi cần.

Google Sheet migration phải là function/script riêng và có tài liệu precondition/rollback; không lưu việc sửa tay như “migration”.

## 14. Vai trò của ADR

ADR dùng khi quyết định:

- thay source of truth;
- thêm/bỏ thành phần nền tảng;
- chọn queue/direct write strategy;
- thay Auth/RBAC enforcement;
- thay year/file ownership;
- thay boundary bound script/web app;
- chấp nhận trade-off dài hạn khó đảo ngược.

ADR không cần cho:

- sửa typo;
- UI spacing;
- bug fix giữ nguyên kiến trúc;
- cập nhật deployment version.

ADR structure tối thiểu:

1. Title/status/date.
2. Context/problem.
3. Decision.
4. Alternatives considered.
5. Consequences/trade-offs.
6. Rollback/revisit condition.
7. Links to implementation/contracts.

ADR đã accepted không sửa nội dung quyết định cũ; tạo ADR mới supersede và cập nhật index.

## 15. Khi nào bắt buộc cập nhật tài liệu

### 15.1. Thay API

Cập nhật:

- `API_CONTRACTS.md`;
- `RBAC_MATRIX.md` nếu permission đổi;
- `DATA_FLOWS.md` nếu flow đổi;
- `TEST_STRATEGY.md`/tests nếu contract mới;
- `PROJECT_CONTEXT.md` nếu rollout state quan trọng.

### 15.2. Thay Google Sheet schema

Cập nhật:

- migration function/runbook;
- `SPREADSHEET_CONTRACTS.md`;
- snapshot mới;
- `PROJECT_SCHEMA.md` reference;
- module/data flow nếu dependency đổi;
- tests/fixtures.

### 15.3. Thay Supabase schema/cache/queue

Cập nhật:

- migration mới;
- `CACHE_AND_QUEUE_CONTRACTS.md`;
- `SUPABASE_SCHEMA.md`;
- API/data flow/RBAC nếu liên quan;
- setup/rollback/workflow;
- tests.

### 15.4. Thay role/Auth

Cập nhật:

- migration;
- proxy/frontend source;
- `RBAC_MATRIX.md`;
- `API_CONTRACTS.md`;
- setup/rollback;
- RBAC tests;
- context rollout state.

### 15.5. Thay module/boundary

Cập nhật:

- `SYSTEM_ARCHITECTURE.md`;
- `MODULE_MAP.md`;
- `DATA_FLOWS.md`;
- ADR nếu là quyết định dài hạn;
- `AI_START_HERE.md` nếu thứ tự đọc thay đổi.

### 15.6. Incident/bug nghiêm trọng

Cập nhật:

- `KNOWN_RISKS.md`;
- regression expectation trong `TEST_STRATEGY.md`;
- contract bị hiểu sai;
- context nếu ảnh hưởng production state/roadmap;
- changelog/ADR nếu tạo quyết định mới.

## 16. Change set documentation matrix

| Loại change | Docs tối thiểu |
| --- | --- |
| Docs-only clarification | File owner của chủ đề |
| Bug fix không đổi contract | Context nếu production state đáng kể; risk/test nếu incident |
| API payload/action | API contract + tests + RBAC nếu cần |
| Sheet mapping/formula | Spreadsheet contract + tests/snapshot nếu schema đổi |
| Cache key/payload | Cache contract + Supabase schema + tests |
| Queue action/lifecycle | Cache/queue contract + API + data flow + tests/runbook |
| Role/permission | RBAC + API + migration/setup/rollback + tests |
| Architecture boundary | Architecture docs + ADR + context |
| Deploy-only | Context/workflow log theo mức cần thiết |
| Year cutover | Architecture/data flow/contracts/operations/context/snapshot |

## 17. Quy trình tạo tài liệu mới

Trước khi tạo file:

1. Xác định chủ đề đã có owner chưa.
2. Tìm file trùng/overlap bằng `rg`.
3. Xác định loại tài liệu và thư mục.
4. Xác định người đọc chính.
5. Xác định source kiểm chứng.
6. Xác định nội dung current/proposed/unknown.
7. Lập outline tránh copy contract khác.
8. Xin phê duyệt nếu file mới ngoài kế hoạch.

Sau khi tạo:

1. `git diff --check`;
2. kiểm tra link/path;
3. kiểm tra tên source/sheet/action/table;
4. thêm link từ entry/index thích hợp khi phạm vi cho phép;
5. ghi trạng thái tài liệu;
6. báo file và mục đích.

## 18. Quy trình cập nhật tài liệu hiện có

1. Đọc toàn bộ file trước khi sửa.
2. Xác định source/live evidence mới.
3. Không xóa warning/history chưa xác minh.
4. Thay nội dung stale bằng current truth và ghi link đến history/ADR nếu cần.
5. Cập nhật ngày xác nhận chỉ cho phần đã thực sự review.
6. Kiểm tra tài liệu liên quan có mâu thuẫn không.
7. Không đổi scope file âm thầm.
8. Ghi rõ trong handoff phần nào được cập nhật.

## 19. Quy trình xử lý tài liệu stale

### 19.1. Dấu hiệu stale

- action/source file không còn tồn tại;
- tài liệu nói module chưa có nhưng source đã có;
- deployment/feature flag khác production;
- sheet trong docs không có trong snapshot/live;
- key/role/status constraint khác migration mới;
- “bước tiếp theo” đã hoàn thành từ lâu;
- ngày xác nhận quá cũ sau nhiều thay đổi liên quan.

### 19.2. Cách xử lý

- gắn nhãn `STALE`/`UNKNOWN` ở section nếu chưa thể sửa đầy đủ;
- link source mâu thuẫn;
- tạo task cập nhật owner doc;
- không copy thông tin stale sang tài liệu mới;
- nếu superseded toàn file, thêm banner/link file thay thế;
- chỉ xóa file sau khi mọi inbound reference đã cập nhật và lịch sử cần thiết được giữ.

### 19.3. Không âm thầm “đoán current”

Nếu production không thể xác minh, dùng wording:

```text
Snapshot/source hiện cho thấy...
Chưa xác nhận trạng thái production live...
```

## 20. Documentation review cadence

Không cần review mọi file theo lịch cứng nếu dự án ít thay đổi. Review theo sự kiện:

- trước/ sau year cutover;
- sau migration;
- sau thay Auth/role;
- sau thêm queue/cache;
- sau incident báo cáo/dữ liệu;
- trước onboarding Agent mới;
- khi `PROJECT_CONTEXT.md` quá dài hoặc mâu thuẫn.

Review định kỳ gợi ý:

- hàng tháng: context/runtime flags/deployment;
- hàng quý: architecture/contracts/risks;
- mỗi năm: spreadsheet snapshots/year configuration/bound script.

Đây là cadence hướng dẫn, không phải automation đã cài.

## 21. AI-specific documentation rules

Tài liệu dành cho Agent phải trả lời được:

- Source of truth là gì?
- Module/file owner là gì?
- Có execution context nào khác không?
- Input/output/side effect là gì?
- Direct hay queue?
- Cache nào bị ảnh hưởng?
- Formula/header/invariant nào không được phá?
- Role nào được phép?
- Test và rollback là gì?
- Thông tin nào chưa xác minh?

Tránh:

- văn phong marketing;
- mô tả “hệ thống mạnh mẽ/hiện đại” không có contract;
- checklist quá chung;
- code block dài copy nguyên source;
- suy đoán kiến trúc tương lai như hiện trạng;
- giấu discrepancy để tài liệu trông gọn.

## 22. Secret và privacy policy trong docs

Không ghi:

- service role key;
- anon key đầy đủ nếu không cần;
- proxy secret;
- password;
- access/refresh token;
- OAuth client secret;
- `.env` content;
- private key;
- user credential;
- dữ liệu tài chính/personnel chi tiết không cần cho schema.

Có thể ghi:

- tên biến môi trường;
- placeholder;
- public deployment URL khi cần vận hành;
- masked ID;
- sample giả.

Nếu secret từng vào tài liệu/Git, xóa text không đủ; phải rotate và xử lý Git history theo incident plan.

## 23. Documentation quality checklist

### 23.1. Correctness

- Tên file/function/action/table/sheet đúng?
- Method/role/key đúng source?
- Current/proposed phân biệt rõ?
- Có contradiction với owner doc khác?
- Source kiểm chứng được ghi?

### 23.2. Completeness

- Scope rõ?
- Invariant/side effect rõ?
- Failure/rollback/test được nhắc khi cần?
- Unknown được ghi?
- Điều kiện update có?

### 23.3. Maintainability

- Không duplicate bảng lớn?
- Link đến owner doc?
- Tên/path ổn định?
- Section có thể tìm bằng search?
- Không phụ thuộc line number dễ drift?

### 23.4. Safety

- Không secret?
- Không hướng dẫn destructive thiếu guard?
- Không khuyến khích sửa production trực tiếp?
- Không biến cache thành source of truth?
- Không bỏ qua bound script/direct Sheet path?

## 24. Handoff khi sửa tài liệu

Handoff phải nêu:

- file đã tạo/sửa;
- mục đích;
- nguồn đã đối chiếu;
- nội dung current/unknown;
- file liên quan chưa cập nhật do giới hạn phạm vi;
- kiểm tra đã chạy;
- bước duyệt tiếp theo.

Nếu chỉ được phép sửa một file, không tự cập nhật context/index trong cùng lượt; ghi rõ cần cập nhật sau khi được phê duyệt.

## 25. Audit tài liệu

Audit tài liệu nên kiểm tra:

1. Broken relative links.
2. File được nhắc nhưng không tồn tại.
3. API action source/docs mismatch.
4. Sheet names source/snapshot/docs mismatch.
5. Role/action mismatch.
6. Cache table/key mismatch.
7. Migration list/order mismatch.
8. Context deployment/flag stale.
9. Duplicate authoritative tables.
10. Missing status/date/source section.
11. Secret-like patterns.
12. Bound snapshot thiếu verification label.

Audit có thể tự động hóa một phần trong tương lai nhưng không thay review nghiệp vụ.

## 26. Ownership hiện tại của bộ tài liệu Phase 1

| File | Chủ đề sở hữu |
| --- | --- |
| `docs/ai/AI_START_HERE.md` | Entry point cho Agent |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | Thành phần/boundary/source of truth |
| `docs/architecture/MODULE_MAP.md` | Module, responsibility và source ownership |
| `docs/architecture/DATA_FLOWS.md` | Luồng dữ liệu end-to-end |
| `docs/contracts/API_CONTRACTS.md` | API action/method/payload/side effect |
| `docs/contracts/SPREADSHEET_CONTRACTS.md` | Google Sheet structure/invariant |
| `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md` | Cache key, sync và queue lifecycle |
| `docs/contracts/RBAC_MATRIX.md` | Role/permission/enforcement |
| `docs/legacy/THU_CHI_BOUND_SCRIPT.md` | Bound script boundary/status |
| `docs/quality/KNOWN_RISKS.md` | Risk register |
| `docs/quality/TEST_STRATEGY.md` | Test strategy/acceptance |
| `docs/governance/DOCUMENTATION_POLICY.md` | Documentation lifecycle/governance |

## 27. Phase transition rule

Bộ tài liệu bắt buộc Phase 1 chỉ được coi là hoàn tất nội dung ban đầu khi:

- từng file đã được người dùng duyệt;
- không có file bắt buộc còn thiếu;
- `git diff --check` pass;
- link/path cơ bản được kiểm tra;
- không có code/schema change ngoài phạm vi;
- discrepancy lớn được ghi nhận thay vì che giấu.

Việc tạo nhóm tài liệu “nên có” hoặc chỉnh sửa tài liệu cũ là phase/task tiếp theo, không tự động bắt đầu nếu chưa được yêu cầu.

## 28. Trạng thái tài liệu

- Loại tài liệu: documentation governance policy.
- Phạm vi: toàn bộ tài liệu, schema snapshots, migrations và handoff trong repository.
- Nguồn kiểm chứng: cấu trúc repository, `AGENTS.md`, bộ tài liệu Phase 1 và các vấn đề drift đã khảo sát.
- Ngày xác nhận gần nhất: 2026-07-11.
- Cần cập nhật khi: cấu trúc docs, owner file, workflow Agent, ADR policy, schema snapshot process hoặc phase documentation thay đổi.
