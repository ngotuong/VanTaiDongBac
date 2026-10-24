# Báo cáo audit WebApp — 24/10/2026

## Phạm vi và kết luận

Audit source trên `codex/r8-mapping-optimization`, base HEAD `68c704b`; working tree sạch trước audit. Candidate đã được gom tại commit `3f3385d`, ban đầu đưa lên PR #2, kế nhiệm bằng PR #3 sau security rewrite và deploy Preview `dpl_5GvH7ZL2yHEZLf8c85pDmEwYDt5G` ngày 24/10/2026. PR #3 đã merge vào `main` bằng `eaf2b2b`; trạng thái vận hành duy nhất vẫn ở [PROJECT_CONTEXT](../../PROJECT_CONTEXT.md).

Đã sửa **11 nhóm lỗi** trong candidate local, không đổi công thức, tiền nguồn, schema, dependency hay quy tắc nghiệp vụ. Sau khi người dùng phê duyệt checkpoint U01–U04, candidate có thêm journal append Vận tải/Danh mục và coverage/incomplete Thu chi. Review diff và canary tiếp theo sửa API Developer Metadata location không tồn tại, đổi marker sang row dimension A1 thật và loại năm env-only khi registry đã có dữ liệu. Full suite **933/933 PASS**; SQL cô lập migrations 001–020 và các kiểm tra retry mới PASS. Không kết luận hệ thống đã hết lỗi nghiêm trọng; không dùng kết quả canary tách biệt để tuyên bố Production đã được sửa.

### Bản đồ phạm vi thực sự kiểm tra

| Khu vực | Source/luồng đã đọc hoặc lấy mẫu sâu | Bằng chứng và giới hạn |
|---|---|---|
| Kiến trúc/nhiều năm | Browser → Next/API → Apps Script → hai workbook; registry, year cookie, active/read-only, wizard và worker | Tái hiện registry, direct-write và worker boundary; không activate 2027 |
| Auth/RBAC | Session/cookie/refresh, active allowlist, shareholder/admin/operator, public health, proxy envelope, read routes, push endpoint allowlist | Test service/HTTP và smoke unauthenticated; không giả định đã QA đủ ba role trong browser |
| Vận tải/Danh mục | Nhập liệu, save/delete, row mapping, formula preservation, queue/claim/manual retry, journal append | Test/fault injection exact/blank/drift/legacy và row move PASS; canary Apps Script/Sheet thật PASS sau khi sửa marker sang row dimension A1 `N:N` |
| Thu chi/Quỹ | Giao dịch/công nợ/vay/Không qua Quỹ, journal, cache theo tháng/khoảng ngày, giới hạn danh sách | Coverage/incomplete regressions PASS; read-only canary trên metadata cache thật 05–10/2026 và 282/282 giao dịch PASS. Chưa đối soát số tiền live hoặc làm pagination nguồn |
| Báo cáo/lương | Version/hash/current bundle, quyền giải trình, nguồn BC có thẩm quyền, các fixture/golden/daily/rounding | Suite hiện hữu PASS; không xác minh lại mọi công thức/dữ liệu tháng 5–8 |
| Sync/thông báo | Trigger ownership, time budget/cooldown, invalidation, queue lifecycle, per-device delivery ledger | SQL concurrency/fault tests và suite hiện hữu; chưa đo tải lớn/quota hoặc edit→UI thực |
| Giao diện/chất lượng | Loading/error/empty, filter/search/pagination, optimistic status, pending/terminal jobs, hành vi gửi lại form, contract responsive/accessibility | Sửa handler gửi lệnh; render/source tests PASS. Authenticated Preview QA PASS Quỹ 2026, khoảng cả năm với 1.340 giao dịch, phân trang 1–20 → 21–40 và 2027 chỉ đọc/không có thao tác ghi |
| Vận hành | Git, lockfile, scripts gate, identity, dependency audit, deploy guards | Candidate đã commit/push/Preview; Production deployment ID được xác nhận không đổi. Project canary cloud tách biệt đã chạy xong; hai spreadsheet giả và project đều đã chuyển vào Thùng rác |

Đây là audit theo ranh giới rủi ro và kiểm thử toàn suite, không phải chứng nhận đã đọc từng dòng source hay kiểm thử mọi dữ liệu/màn hình thực tế. Tìm `TODO/FIXME/HACK/XXX` trong runtime/tests không thấy backlog mới từ các marker này. Rủi ro hiện hành đã được đối chiếu với `KNOWN_RISKS.md`.

## Lỗi đã sửa trong candidate local

| Mã/mức | Điều kiện và nguyên nhân gốc | Sửa đổi | Xác minh |
|---|---|---|---|
| A01 — P1 | Registry có dữ liệu nhưng không có năm `active`; `configurationAsync()` vẫn dùng `DEFAULT_WORKBOOK_YEAR` từ env. Cặp ID registry không hợp lệ hoặc một năm chỉ có trong env cũng có thể giữ lại mapping cũ | Khi registry có row, dựng toàn bộ context từ registry; chỉ chấp nhận đúng một cặp active hợp lệ. Giữ fallback env trước khi registry tồn tại/rỗng theo compatibility hiện hữu | Tests ready/archived/no-active/multiple-active/invalid-pair/env-only; không có enqueue khi trả 503/404 |
| A02 — P1 | `WriteJobRepository.get()` không SELECT `payload`; `assertActiveWriteJobYear_()` mất năm của job, nên retry job cũ được coi là năm active | Đọc payload thật khi lấy job; guard hiện hữu nhận được `payload.year` | Mock mô phỏng đúng projection PostgREST + test SQL đọc year; retry năm cũ không update |
| A03 — P1 | Manual retry kiểm `failed` trước PATCH nhưng PATCH chỉ lọc ID; request thứ hai có thể reset job đã được worker claim, hoặc xóa lỗi reconciliation của một lần thất bại mới | Conditional PATCH theo ID + `failed` + `updated_at` đã quan sát; yêu cầu `return=representation`, từ chối khi không có row thay đổi; chỉ ghi retry log sau transition thực | Mô phỏng worker race/ABA; repository chạy với PostgreSQL thật giữ worker ownership và lỗi reconciliation, chỉ một retry log |
| A04 — P1 | Legacy `addFundTransaction` không qua write-command service; Apps Script direct dispatch và worker chỉ resolve workbook, không kiểm năm được ghi | Vercel legacy route kiểm registry nhưng giữ response đồng bộ; Apps Script phân loại business writes và kiểm năm active độc lập với APP_CONFIG của request; worker kiểm lại trước execute | Direct future-year API và worker đều bị chặn trước writer; active-year direct API và response cũ vẫn thành công |
| A05 — P2 | `decodeURIComponent` ném lỗi cho một cookie malformed, kể cả cookie không liên quan Auth, làm request hợp lệ lỗi 500 | Bỏ qua cookie sai encoding; token hợp lệ khác vẫn được đọc; token sai đi qua luồng refresh/401 | Tests cookie phụ sai và auth cookie sai; session suite PASS |
| A06 — P2 | `/api/app` serialize raw `spreadsheetId` từ health và payload/result job; kể cả health không cần Auth | JSON replacer loại các key routing workbook ở mọi độ sâu, không mutate payload nội bộ/intent | Execute serializer thật với nested jobs; dữ liệu nghiệp vụ giữ nguyên. Preview health 200 xác nhận không còn key `spreadsheetId` |
| A07 — P1 | Entry/Manage/Catalog tạo UUID mới mỗi lần Lưu. Nếu queue đã nhận nhưng mất response, người dùng gửi lại tạo job mới, làm yếu idempotency | Client ghi riêng theo component giữ ID cho cùng action/params/body chưa xác nhận, canonical hóa key; chỉ giải phóng khi nhận jobId. Nội dung/năm/action khác được tách riêng; gửi mới sau success có ID mới | Mô phỏng mất response sau enqueue bền vững bằng repository thật/fake HTTP: retry chỉ có 1 insert; lần nhập mới sau xác nhận tạo job thứ hai. Tests edits/reorder/invalid acknowledgement và wiring 3 component |

Trạng thái A01–A07: **đã xác minh bằng full suite và các boundary nêu trên**; candidate đã qua smoke/authenticated QA Preview nhưng **chưa kiểm chứng đầy đủ trên mọi Apps Script/Sheets/role/thiết bị thật**. A07 giữ ID trong đời component, không cam kết giữ khi reload/đóng form hay qua thiết bị khác. A06 loại metadata có key xác định, không tuyên bố che ID trong mọi chuỗi: API legacy còn `links` và `/open-sheet` cố ý điều hướng người đã đăng nhập tới Sheet. Spreadsheet ID không phải credential; cần thống nhất yêu cầu sản phẩm nếu muốn bỏ cả liên kết này.

### File đã sửa và mục đích

- [workbook-context-service.js](../../server/services/workbook-context-service.js): registry lifecycle và loại mapping không hợp lệ.
- [AppConfig.gs](../../AppConfig.gs), [ApiActionRegistry.gs](../../ApiActionRegistry.gs), [PublicApi.gs](../../PublicApi.gs): xác định business writes và kiểm năm được ghi tại Apps Script API.
- [SupabaseService.gs](../../SupabaseService.gs), [WriteJobRepository.gs](../../WriteJobRepository.gs), [SupabaseHttpClient.gs](../../SupabaseHttpClient.gs): đọc year thật, conditional retry và worker gate.
- [api/app.js](../../api/app.js), [public-api-response.js](../../server/services/public-api-response.js): legacy Fund admission và loại routing metadata khỏi JSON công khai.
- [session-cookie-service.js](../../server/services/session-cookie-service.js): cô lập lỗi parse cookie.
- [retry-safe-write-client.ts](../../next-shell/lib/platform/retry-safe-write-client.ts), [EntryModule.tsx](../../next-shell/components/entry/EntryModule.tsx), [ManageReadOnlyModule.tsx](../../next-shell/components/manage/ManageReadOnlyModule.tsx), [CatalogModule.tsx](../../next-shell/components/catalog/CatalogModule.tsx): giữ request ID khi mất xác nhận; không thay layout hay mapping nhập liệu.
- [SheetWriteJournal.gs](../../SheetWriteJournal.gs), [EntryService.gs](../../EntryService.gs), [SheetService.gs](../../SheetService.gs), [TransportJobHandler.gs](../../TransportJobHandler.gs): marker theo range, intent hash và fail-closed replay cho append Vận tải/Danh mục.
- [fund-range-service.js](../../server/services/fund-range-service.js), [cashflow-server.ts](../../next-shell/lib/cashflow-server.ts), [cashflow-types.ts](../../next-shell/lib/platform/cashflow-types.ts), [CashflowModule.tsx](../../next-shell/components/cashflow/CashflowModule.tsx): coverage tháng có bằng chứng, giữ limited/incomplete và cảnh báo subset trên UI.
- [audit-boundary-regressions.test.js](../../tests/audit-boundary-regressions.test.js), [retry-safe-write-client.test.js](../../tests/retry-safe-write-client.test.js): regression mới cho các lỗi trên.
- [supabase-http-client.test.js](../../tests/supabase-http-client.test.js), [write-job-repository.test.js](../../tests/write-job-repository.test.js), [next-catalog-b5.test.js](../../tests/next-catalog-b5.test.js), [test-r8-sql.mjs](../../scripts/test-r8-sql.mjs): response representation, conditional filters, client wiring và SQL thực.
- `PROJECT_CONTEXT.md`, `KNOWN_RISKS.md`, API/cache contracts và báo cáo này: candidate, rủi ro mở và phạm vi kiểm chứng.

## Phát hiện trọng yếu và trạng thái khắc phục local

### U01 — P1, đã tái hiện: Transport append replay ghi lại vị trí đã dịch chuyển

`EntryService.submitRowsWithContext()` lấy reservation chỉ chứa `sheetName/startRow`, đặt `idempotentReplay=true` rồi vẫn `context.writeRows()`. `findWriteJobRange_()` không xác minh nội dung/marker tại vị trí đó trước ghi. Nếu lần trước đã ghi Sheet nhưng chưa hoàn tất job, sau đó người dùng chèn/xóa/move row, retry có thể ghi vào dữ liệu khác. ScriptLock không khóa chỉnh sửa trực tiếp của người dùng trong Sheet.

Mô phỏng reservation row 10 với dòng hiện tại `[2026-10-22, OTHER-ROW]`: gọi retry đổi thành `[2026-10-23, INTENDED-ROW]`, trả `ok=true`, `idempotentReplay=true`. Chỉ dùng fake sheet; chưa có bằng chứng đã xảy ra trên dữ liệu thật.

**Đã khắc phục local và xác minh bằng canary:** `SheetWriteJournal` gắn `WRITE_JOB_INTENT_V2` vào row đầu của block và lưu intent hash. Apps Script chỉ hỗ trợ `DeveloperMetadataLocation.getRow()` cho metadata theo row; review đã thay lời gọi `getRange()` không tồn tại và tái dựng block từ row marker + shape của intent. Lần chạy canary đầu còn phát hiện numeric range phủ đủ cột vẫn bị coi là arbitrary range; marker đã đổi sang row dimension A1 `N:N`. Exact match replay không gọi writer; blank marker tiếp tục crash-before-write; partial/drift/hash/shape sai trả `REQUIRES_RECONCILIATION`. Reservation legacy chỉ được replay khi row đã khớp hoàn toàn. Unit/fault test bao phủ marker đổi từ row 10 sang 27, partial write và legacy drift; lần chạy lại trên Apps Script/Sheet thật PASS toàn bộ harness.

### U02 — P1, đã tái hiện: cache thiếu tháng đầu bị coi là không có dữ liệu

`fund-range-service.contiguousCachedRows()` bỏ mọi phần tử null ở đầu; `cashflow-server.ts` dùng phần còn lại để tính toàn khoảng. Không có bằng chứng những tháng đó thực sự không có nghiệp vụ. Test hiện hữu chỉ mô tả pre-data gaps, chưa phân biệt thiếu cache sau mất/đang rebuild bundle.

Ví dụ tháng 5 nguồn có thu 100 nhưng cache bị mất; tháng 6 cache có thu 50, metadata vẫn liệt kê tháng 5. Khoảng 01/05–30/06 được chấp nhận và trả thu 50 thay vì 150. Đây là mô phỏng mất cache; không kết luận số liệu Production hiện đang sai.

**Đã khắc phục local:** leading gap chỉ được bỏ khi mọi bundle còn lại có cùng danh sách tháng nguồn, từng bundle khớp tháng được query và metadata chứng minh các tháng thiếu nằm trước dữ liệu. Internal/trailing gap, metadata thiếu/lệch hoặc mất một tháng đã biết đều fail closed sang lỗi cache chưa đầy đủ. Không sửa công thức hoặc số tiền nguồn.

**Canary read-only:** phiên Production đã xác thực cho thấy metadata nguồn 2026 gồm 05–10, đúng với ngày bắt đầu dữ liệu trong contract; candidate chấp nhận bốn tháng 01–04 chỉ khi coverage đồng nhất. Bản sao metadata trong bộ nhớ bị bỏ một tháng đã biết, tạo gap giữa/cuối, lệch `selectedMonth`, lệch hoặc mất coverage đều bị từ chối. Canary không ghi Supabase/Sheet và không đối soát lại số tiền nguồn.

### U03 — P2, đã tái hiện: mất cảnh báo dữ liệu giao dịch bị giới hạn

`FundTransactionService` giữ tối đa 1.000 giao dịch trong một capture và trả `limited`; `mergeTransactionBundles()` luôn trả `limited:false`, `totalRows=transactions.length`. `CashflowModule` không hiển thị `limited`. Khi một tháng vượt giới hạn, màn hình/kết quả tìm kiếm có thể thiếu giao dịch mà không cảnh báo.

Mô phỏng một bundle `limited:true`, `totalRows:1001` chỉ chứa một dòng đại diện: merge trả `limited:false`, `totalRows:1`. Đây là ví dụ tối giản chứng minh mất metadata, không phải số dòng thực tế trên Production.

**Đã khắc phục local:** merge giữ `limited/incomplete`, `displayedRows` và `sourceTotalRows`; tìm kiếm không xóa provenance. Candidate checkpoint tiếp theo đã thêm snapshot tháng versioned/page 200, publish manifest cuối, server pagination và mixed-version fail closed; trạng thái deploy/gate hiện hành thuộc `PROJECT_CONTEXT.md`. UI không còn trình bày subset như dữ liệu chắc chắn đầy đủ.

**Canary read-only:** bundle hiện hành có 282/282 giao dịch, `limited=false`, `incomplete=false`; candidate giữ đúng trạng thái này và chuyển cả hai cờ sang `true` khi fault fixture dùng `totalRows=1001, limited=true`. Dữ liệu hiện tại không chạm ngưỡng 1.000 nên chưa thể quan sát cảnh báo giới hạn bằng browser trên Production.

### U04 — P1, nguy cơ có bằng chứng source: append Danh mục chưa có journal của job

`TransportJobHandler.execute(saveSheetRow)` không truyền job identity tới `SheetService.saveSheetRow`. Khi `rowIndex` rỗng, mỗi lần gọi lại chọn append row mới; so sánh replay chỉ áp dụng lên row vừa chọn. Crash sau append nhưng trước lưu trạng thái job có thể append trùng trong lần worker chạy lại. A07 ngăn tạo hai job ở frontend trong một phiên; **không giải quyết retry của cùng job sau Sheet write**.

**Đã khắc phục local:** handler truyền `job.id/idempotency_key` tới `saveSheetRow`; append dùng cùng journal U01 trước writer, còn edit row hiện hữu giữ guard `previousRowData`. Tests xác nhận job identity xuyên handler và journal không append lại khi exact replay. Chưa mô phỏng writer trên Sheet live; không gọi đây là sự cố Production đã xảy ra.

### Tồn đọng hiện hữu và discrepancy

- `npm audit` còn 1 High thuộc dev chain `eslint-config-next@16.3.8 → eslint-plugin-react-hooks → zod@4.4.3`; advisory yêu cầu `zod>=4.6.6`. `npm audit --omit=dev` = 0. Không tự đổi lockfile/toolchain ngoài checkpoint này.
- Payroll lịch sử tháng 5–8 `needs_review`, natural edit→UI SLA và Safari/PWA/push trên iPhone vật lý vẫn mở theo context; không được đóng bằng bộ test local.
- Cache/queue contract đã được cập nhật theo candidate Developer Metadata + intent hash; Production chưa deploy nên vẫn phải đối chiếu version runtime khi xử lý incident.
- Các retry test cũ trả đầy đủ raw row dù query không SELECT payload. Mock không mô phỏng projection đã che A02; regression mới kiểm đúng query/result boundary.
- Cần phân biệt invariant “browser không quyết định workbook bằng ID” với việc người dùng được mở liên kết Google Sheet. Không coi ID công khai là bằng chứng lộ service-role/proxy secret.

## Kiểm thử và bằng chứng

| Kiểm tra đã chạy | Kết quả |
|---|---|
| Bootstrap môi trường | Ban đầu thiếu dependencies; `npm ci --ignore-scripts` cài đúng lockfile, không đổi package/lock |
| Baseline `npm test` sau cài | 907 PASS, 0 fail |
| Reproduction trước sửa A01–A06 | 8 assertion lỗi + 1 control PASS; thêm 2 test direct/worker năm read-only lỗi trước sửa |
| Regression và full suite sau review U01–U04 | 933 PASS, 0 fail, 0 skipped |
| `npm run test:sql` | PASS trên Docker PostgreSQL network-none, migrations 001–020; claim disjoint, RLS/grants, worker faults, exact retry snapshot/ABA/log |
| `npm run lint` | PASS theo scope lint hiện hữu |
| `npm run typecheck` | PASS |
| `npm run build` | PASS gồm Identity Guard và Next build |
| `npm audit --omit=dev` | 0 vulnerability |
| `npm audit` | 1 High dev-only transitive `zod`; còn mở |
| `git diff --check` | PASS |
| Kiểm tra cú pháp/link bổ sung | 68 file Apps Script parse PASS; JS thay đổi syntax PASS; 32 liên kết Markdown local hợp lệ |
| Production read-only HTTP | `/` 200, title `Vận tải Đông Bắc`; health 200; unauthenticated runtimeContext và manage-data 401 |
| Browser | Authenticated Preview QA PASS cho Quỹ 2026: khoảng 01/01–24/10 có 1.340 giao dịch, phân trang 1–20 → 21–40; năm 2027 có nhãn chỉ đọc và không có nút thêm/sửa/xóa. Không gửi giao dịch; chưa QA đủ role, mobile/theme/keyboard |
| Apps Script canary 24/10 | Sau khi xác minh tài khoản, lần chạy đầu phát hiện metadata không thể gắn lên numeric full-width range. Đổi sang row dimension A1 `N:N`, bổ sung regression và đẩy riêng vào project canary; lần chạy lại PASS exact replay, row shift, crash-before-write, partial/drift/hash, missing marker, split block và occupied target. Hai spreadsheet giả được đưa vào Thùng rác qua `finally`; project canary trở lại Thùng rác |
| Fund coverage canary 24/10 | Read-only metadata thật qua phiên authenticated: 05–10/2026, bốn leading pre-data months, 282/282 giao dịch không limited/incomplete. Candidate PASS coverage thật đã rút gọn và bảy fault cases thiếu/lệch coverage + limited provenance; không đọc key bí mật vào repo, không ghi Supabase/Sheet |
| Authenticated browser QA 24/10 | Production Quỹ 2026 tải từ Supabase; khoảng 01/01–24/10, danh sách 282 giao dịch có phân trang; 2027 hiển thị chỉ đọc/không có nút ghi rồi phiên được trả về 2026. Đây là baseline Production, chưa phải candidate Preview |
| Preview deploy/QA 24/10 | `npm run deploy:preview` PASS toàn bộ gate và smoke; stable alias trỏ `dpl_5GvH7ZL2yHEZLf8c85pDmEwYDt5G`, health xác nhận `businessWritesPaused=true`/không có `spreadsheetId`, Production giữ `dpl_GBoatQF8rDwzLNtddtRr79wULwSL`. Phiên authenticated xác minh Quỹ 2026 có 1.340 giao dịch/phân trang và 2027 chỉ đọc; không gửi write |

Cách chạy lại: các lệnh trong [TEST_STRATEGY](TEST_STRATEGY.md); regression tập trung bằng `node --test tests/audit-boundary-regressions.test.js tests/retry-safe-write-client.test.js tests/supabase-http-client.test.js tests/write-job-repository.test.js`. SQL runner chỉ tạo/xóa database disposable, không apply migration vào Supabase live.

Không chạy trigger, financial reconciliation, đối soát số tiền nguồn hay benchmark tải lớn. Canary journal dùng dữ liệu giả trong project tách biệt; Fund canary chỉ dùng metadata thật đã rút gọn và fault fixture trong bộ nhớ. Không lấy các canary hoặc 933 test làm bằng chứng không có race/quota trên workload Production. Bản sửa không thay mapping business columns, công thức hoặc phép tính tiền nguồn.

## Đề xuất cải tiến — chưa triển khai

| Ưu tiên/tính năng | Vấn đề hiện tại | Giải pháp và lợi ích | Độ phức tạp | Tác động cấu trúc/dữ liệu | Rủi ro/nhược điểm |
|---|---|---|---|---|---|
| P1 — Trung tâm đối soát lệnh chưa rõ kết quả | Người dùng khó phân biệt chưa ghi, đã ghi nhưng chưa báo xong, và không được retry | Hiển thị job/intent/marker/những bước verify, hướng dẫn đúng thao tác; giảm gửi trùng | Cao; làm sau U01 | Journal metadata và màn hình; migration nếu cần bảng mới, duyệt riêng | Đối soát nhầm có thể mở retry sai; cần mặc định khóa và chứng cứ exact |
| P1 — Tính đầy đủ của dữ liệu theo khoảng | Thiếu bundle/cắt dòng khó phát hiện | Hiển thị tháng đã phủ, tháng thiếu, số dòng và thời điểm sync; ngăn hiểu subset là tổng đủ | Trung bình–cao; đi cùng U02/U03 | Read-model metadata, server/UI; giữ Sheet source of truth | Tăng trạng thái chờ/chi phí đọc; cần tránh full refresh hàng loạt |
| P2 — Màn hình truy vết job → Sheet → cache | Hiện cần ghép log từ nhiều nơi | Một mã liên kết và các mốc tiếp nhận/claim/ghi/đồng bộ; hỗ trợ kiểm SLA và xử lý sự cố | Trung bình | Metadata vận hành, không đổi nghiệp vụ | PII trong log; cần giới hạn quyền, retention và không log raw payload |
| P2 — Bộ E2E trên bản sao có fault injection | Source/regex tests bỏ sót projection, crash và hành vi thật | Chạy representative roles, đổi năm, retry mất response, row shift, cache gap trên exact canary; tăng độ tin cậy release | Cao | Hạ tầng kiểm thử tách biệt; không dùng Production | Chi phí Google quota, cleanup và quản lý tài khoản test |
| P2 — Phân trang giao dịch theo dữ liệu nguồn | Candidate đã dùng page cache bất biến + manifest versioned, total/coverage đúng và tìm kiếm trên toàn phạm vi | Cần paired Apps Script/Preview cutover và authenticated live canary trước khi đóng | Trung bình–cao | Không cần schema migration; cần cửa sổ shared HEAD riêng | Version đổi giữa các trang sẽ báo và quay về trang đầu; mixed legacy/versioned fail closed |
| P3 — Cảnh báo lệch tài liệu/source | Contract dễ mô tả cơ chế đã đổi | Contract tests ở ranh giới observable và kiểm trạng thái snapshot; ưu tiên behavior thay regex | Thấp–trung bình | Tests/docs, không đổi dữ liệu | Không biến test thành bản sao implementation |

Review diff, canary journal, Fund coverage, commit/push, authenticated Preview QA và merge PR #3 vào `main` đã hoàn tất. Production chỉ được promote/rollback trong một yêu cầu phê duyệt riêng. Chưa QA đủ role/thiết bị. Không reset queue/journal hoặc phục hồi nguyên workbook để triển khai/rollback candidate này.
