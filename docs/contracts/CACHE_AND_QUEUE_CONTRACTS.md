# CACHE_AND_QUEUE_CONTRACTS

## 1. Mục đích và phạm vi

Tài liệu này định nghĩa contract hiện trạng của lớp Supabase cache, trạng thái đồng bộ và write queue trong hệ thống Vận tải Đông Bắc.

Phạm vi gồm:

- vai trò của từng bảng Supabase;
- primary key và quy ước cache key;
- payload ownership;
- cơ chế đọc, fallback và freshness;
- sync hẹp, trigger và full backfill;
- trạng thái/audit cache;
- write job schema và lifecycle;
- atomic claim, retry và stale recovery;
- idempotency cho Vận tải và Thu chi;
- side effect sau khi worker ghi Google Sheet;
- invariant bảo mật và vận hành.

Tài liệu không chuyển source of truth sang Supabase. Google Sheets vẫn là nguồn dữ liệu đối soát cuối cùng.

## 2. Nguyên tắc nền tảng

1. Supabase cache là bản sao phục vụ đọc nhanh, không phải dữ liệu nghiệp vụ chuẩn cuối cùng.
2. `write_jobs` lưu ý định ghi và trạng thái xử lý, không thay thế row đã ghi trong Google Sheet.
3. Frontend phải phân biệt `accepted` với `synced`.
4. Cache thiếu/lỗi phải fallback Apps Script khi luồng tương ứng hỗ trợ.
5. Payload cache có `ok:false` không được coi là cache hợp lệ.
6. Sau ghi, ưu tiên sync hẹp theo module/sheet/tháng.
7. Không chạy full backfill trong request người dùng.
8. Worker phải claim job atomically và có idempotency guard trước Google Sheet write.
9. Physical `deleteRow()` không được thực thi bất đồng bộ theo row index.
10. Không đưa service role key vào browser.
11. Không dùng cache Supabase để sửa ngược Google Sheet.
12. Migration đã chạy không được sửa; thay đổi schema phải dùng migration mới.

## 3. Phân loại bảng Supabase

### 3.1. Cache đọc

| Bảng | Module | Nội dung |
| --- | --- | --- |
| `report_bundles` | Vận tải | Dashboard và report bundle theo kỳ |
| `startup_bundles` | Chung/Vận tải | Dữ liệu màn hình khởi động |
| `catalog_bundles` | Vận tải/Thu chi | Catalog/form options/display sheet bundle |
| `manage_data_bundles` | Vận tải | Dữ liệu `NL_*` gần nhất hoặc theo tháng |
| `fund_overview_bundles` | Thu chi | Tổng quan Thu chi latest/theo tháng |
| `fund_transaction_bundles` | Thu chi | Giao dịch gần nhất/theo tháng |
| `fund_loan_bundles` | Thu chi | Khoản vay latest/theo tháng |

### 3.2. Quan sát và queue

| Bảng | Vai trò |
| --- | --- |
| `sync_status` | Trạng thái lần sync gần nhất theo `sync_key` |
| `write_jobs` | Write intent, lifecycle, result và retry metadata |
| `write_job_logs` | Nhật ký chuyển trạng thái/thực thi của job |

### 3.3. Auth/RBAC liên quan

| Bảng | Vai trò |
| --- | --- |
| `app_users` | Allowlist user, role và trạng thái active |

`app_users` không phải cache nghiệp vụ nhưng được RLS function dùng để cấp quyền đọc các bảng cache/queue.

## 4. Contract chung của cache bundle

### 4.1. Payload

Các bảng cache lưu `payload jsonb`. Payload là response/domain object đã được Apps Script tạo từ Google Sheets.

Contract:

- Apps Script service sở hữu cấu trúc payload;
- frontend là consumer, không tự ghi payload;
- payload phải JSON-serializable;
- date phải được serialize ổn định;
- không chứa secret/service role key/proxy secret;
- không chứa object Apps Script không serialize được;
- `ok:false` không được upsert như một bundle thành công;
- thay đổi shape phải kiểm tra toàn bộ consumer và fallback.

### 4.2. Timestamp

Các bundle có:

- `synced_at`: thời điểm source được đồng bộ;
- `created_at`;
- `updated_at` do trigger database cập nhật.

Frontend dùng `synced_at` để hiển thị độ mới. Không dùng `created_at` làm thời điểm dữ liệu gần nhất sau upsert.

### 4.3. Upsert

Apps Script upsert theo primary key của từng bảng bằng service role.

Upsert phải:

- ghi đầy đủ primary key;
- thay payload như một bundle nguyên tử;
- cập nhật `synced_at`;
- không tạo nhiều row cho cùng logical key;
- ghi `sync_status` phù hợp khi sync step thành công hoặc lỗi.

### 4.4. Read contract

Frontend đọc bằng Supabase REST:

- filter exact theo key;
- order `synced_at desc`;
- limit 1;
- dùng JWT user khi Auth bật;
- dùng anon key chỉ làm API key/public project identifier.

Bundle hợp lệ khi:

- HTTP thành công;
- có row;
- có `payload`;
- payload không chứa `ok:false`;
- key trả về đúng request.

Nếu không hợp lệ, frontend fallback Apps Script thay vì render lỗi cache như dữ liệu.

## 5. `report_bundles`

### 5.1. Schema contract

Primary key:

```text
(spreadsheet_id, report_month)
```

Columns:

- `spreadsheet_id text`;
- `report_month text`;
- `source_sheet_names text[]`;
- `payload jsonb`;
- `cache_version text`, nullable cho row legacy;
- `source_data_version text`, nullable cho row legacy;
- `details_hash text`, nullable hoặc SHA-256 chữ thường 64 ký tự;
- `synced_at`, `created_at`, `updated_at`.

Ba cột metadata được thêm bằng migration `010`. Chúng phục vụ cutover khỏi `SYS_ReportCache`; không thay primary key và không biến Supabase thành source of truth.

### 5.2. Key convention

`report_month` có các dạng:

- label kỳ báo cáo thực tế, ví dụ `05/2026`, `06/2026`, `07/2026`;
- `Tất cả`;
- `__dashboard_latest__` cho dashboard/latest trips;
- giá trị được `resolveBundleMonth_()` chuẩn hóa từ request như `latest`.

Không dùng `YYYY-MM` thay thế label report nếu service/report controller đang dùng `MM/YYYY`. Cache key phải khớp giá trị backend thực sự resolve.

### 5.3. Source

Payload có thể đọc từ:

- `BC_TongQuan`;
- `BC_BangLuong`;
- `BC_TongHopXe`;
- `NL_VanChuyen` cho dashboard/latest trips;
- sheet tạm từ `BC_TongQuan` để tính trực tiếp chi tiết tháng khi Supabase miss/lỗi; `SYS_ReportCache` đã nghỉ khỏi runtime.

`source_sheet_names` phải phản ánh các sheet nguồn chính của bundle.

### 5.4. Sync

Các đường sync:

- sync một tháng;
- sync dashboard;
- sync tất cả report months;
- sync tháng liên quan sau write Vận tải;
- tick luân phiên report recent/`Tất cả`;
- hàng đợi ưu tiên sau chỉnh sửa trực tiếp Sheet Vận tải;
- full backfill.

Sau write Vận tải, month key được lấy từ payload row rồi đổi sang report label. Có thể sync thêm `Tất cả`.

Chỉnh sửa trực tiếp `NL_*` dùng Script Property `SUPABASE_PENDING_TRANSPORT_REPORT_SYNC` làm hàng đợi debounce một item:

- các edit trong cùng cửa sổ 15 giây được gộp và dedupe theo `YYYY-MM`;
- edit thông thường sync từng tháng bị ảnh hưởng rồi sync `Tất cả`;
- xóa dòng/thay đổi cấu trúc/không xác định được sheet nâng item thành `full=true`;
- `syncRealtimeCache()` atomically claim item đến hạn trước vòng tick thường và không tăng rotation index cho lượt ưu tiên;
- edit mới trong khi item đang chạy tạo item kế tiếp, không bị claim cũ ghi đè;
- lỗi requeue toàn scope sau 30 giây để đảm bảo eventual consistency.
- report compute đăng ký token guard; `INSERT_GRID`/`REMOVE_GRID` do temp sheet nội bộ phải skip để queue không tự tạo vòng lặp, nhưng row-level structural changes vẫn phải queue.

SLA mục tiêu cho edit thông thường là tối đa khoảng 2 phút từ lúc edit đến khi Supabase có bundle mới, gồm debounce, độ trễ trigger tick và thời gian compute. Đây không phải transaction guarantee khi Apps Script bị quota/contention hoặc công thức chưa tính xong. Full refresh do structural change có thể lâu hơn.

### 5.5. Audit

Report audit:

1. đọc cache row;
2. tạo live bundle từ Google Sheet;
3. loại field volatile như `updatedAt`;
4. stable stringify/hash;
5. so sánh cached/live hash;
6. trả trạng thái missing/stale/ok/error.

Audit không tự sửa cache. Sync lại là thao tác riêng.

### 5.6. Feature flag cutover

Apps Script đã khóa vĩnh viễn report cache ở chế độ `supabase`. Script Property `REPORT_CACHE_MODE` chỉ còn là metadata tương thích; giá trị trống, `sheet`, `dual` hoặc không hợp lệ đều được chuẩn hóa thành `supabase`.

Runtime ưu tiên `payload.overview.details` ở Supabase. Nếu Supabase read lỗi/miss, Apps Script tính trực tiếp bằng bản sao tạm của `BC_TongQuan`, trả kết quả và upsert full bundle; không đọc, ghi hoặc tự tạo `SYS_ReportCache`. Rollback về cache Sheet đã nghỉ và không còn là đường phục hồi hợp lệ.

`syncAllReportBundles()` phải:

1. invalidation đúng một lần và lấy một `source_data_version`;
2. dựng bundle `Tất cả` trước để batch-compute toàn bộ tháng thiếu;
3. giữ map chi tiết trong memory theo `(spreadsheet_id, dataVersion)` trong cùng execution;
4. dựng/upsert từng tháng và `Tất cả` với cùng version;
5. không gọi force refresh làm tăng version riêng cho từng tháng.

E1.2 triển khai code/candidate nhưng production vẫn giữ `sheet`. Việc bật `dual` và chạy parity thuộc E1.3.

## 6. `startup_bundles`

### 6.1. Schema contract

Primary key:

```text
form_type
```

Columns:

- `form_type text`;
- `payload jsonb`;
- timestamps.

### 6.2. Key convention

`form_type` là form startup, mặc định phổ biến:

```text
vanChuyen
```

Không dùng empty string và `all` lẫn nhau nếu service chưa normalize thành cùng key.

### 6.3. Source và sync

Payload đến từ `SheetService.getStartupData(formType)`.

Sync khi:

- chạy startup/catalog sync;
- tick luân phiên;
- full backfill;
- danh mục ảnh hưởng startup thay đổi.

## 7. `catalog_bundles`

### 7.1. Schema contract

Primary key:

```text
catalog_key
```

Columns:

- `catalog_key text`;
- `payload jsonb`;
- timestamps.

### 7.2. Key families

`catalog_key` có nhiều namespace logic:

- catalogs theo form Vận tải;
- catalog data theo `displaySheetName`;
- fund form options theo `year`;
- fund catalog theo `year` và `group`.

Key phải được tạo bằng helper tương ứng trong `SupabaseService`/`client_api`, không nối chuỗi riêng ở consumer.

Hai phía phải khớp:

- backend: `buildCatalogsKey_`, `buildCatalogDataKey_`, `buildFundFormOptionsKey_`, `buildFundCatalogKey_`;
- frontend: các helper `build*KeyForSupabase` tương ứng.

### 7.3. Virtual sheet

Catalog data cho `DM_ThamSo_TS` và `DM_ThamSo_GD` dùng display key riêng dù nguồn vật lý cùng là `DM_ThamSo`.

Khi `DM_ThamSo` thay đổi, phải sync:

- catalog nguồn/form liên quan;
- `DM_ThamSo_TS` bundle;
- `DM_ThamSo_GD` bundle.

### 7.4. Fund catalog

Fund form/catalog bundles dùng `year` trong key. Không cache danh mục file 2027 dưới key 2026 dù nội dung giống nhau.

## 8. `manage_data_bundles`

### 8.1. Schema contract

Primary key:

```text
(sheet_name, filter_key)
```

Columns:

- `sheet_name text`;
- `filter_key text`;
- `payload jsonb`;
- timestamps.

### 8.2. Sheet scope

Các sheet Vận hành:

- `NL_VanChuyen`;
- `NL_TaiXe`;
- `NL_Dau`;
- `NL_ChamCong`;
- `NL_Phat`;
- `NL_NghiVanHanh`.

Không tạo manage cache cho `DM_*`, `XL_*` hoặc `BC_*` bằng bảng này.

### 8.3. Filter key

Hai dạng chính:

```text
recent_500
month:YYYY-MM
```

`recent_500` là phạm vi cache tối đa, không đảm bảo payload luôn có đúng 500 row nếu Sheet ít dữ liệu hơn.

`month:YYYY-MM` chứa dữ liệu thuộc một tháng chuẩn hóa.

### 8.4. Read behavior

- Không có date filter: frontend ưu tiên `recent_500`.
- Khoảng ngày phủ tháng rõ ràng: frontend có thể đọc nhiều `month:*`, combine rồi filter lại.
- Cache tháng thiếu/lỗi: fallback Apps Script.
- Search/pagination thường được áp phía frontend trên payload đã đọc.

### 8.5. Sync behavior

Sau write `NL_*`:

- luôn cân nhắc `recent_500`;
- sync month từ row payload nếu xác định được;
- nếu thiếu context, fallback các tháng gần nhất;
- `NL_VanChuyen` còn ảnh hưởng dashboard/report.

Trigger edit/change trực tiếp Sheet cũng sync bảng này.

### 8.6. Audit

Manage audit so sánh cache `recent_500` với live Sheet sau chuẩn hóa.

Modes:

- quick: số row nhỏ hơn, thường 50;
- deep: tới 500;
- một sheet hoặc toàn bộ `NL_*`.

Audit 50 row không phát hiện sai lệch ở row 51 trở đi. Deep audit mới bao phủ phạm vi `recent_500`.

## 9. Fund cache tables

### 9.1. `fund_overview_bundles`

Primary key:

```text
(year, month_key)
```

Key:

- `year`: ví dụ `2026`;
- `month_key=''`: latest/all context;
- `month_key='YYYY-MM'`: tháng cụ thể.

Payload: kết quả `FundService.getFundOverview()`.

### 9.2. `fund_transaction_bundles`

Primary key:

```text
(year, filter_key)
```

Filter key:

```text
recent_500
month:YYYY-MM
```

Payload: kết quả `FundService.getFundTransactions()` theo filter tương ứng.

### 9.3. `fund_loan_bundles`

Primary key:

```text
(year, month_key)
```

Key giống fund overview:

- empty month cho latest;
- `YYYY-MM` cho kỳ.

Payload: kết quả `FundService.getFundLoanOverview()`.

### 9.4. Sync sau write Thu chi

Full fund sync có thể gồm:

- overview latest;
- overview từng tháng;
- transactions recent;
- transactions từng tháng;
- loans latest;
- loans từng tháng;
- fund catalog/form options.

Sync hẹp sau write phải lấy month key từ:

- transaction date;
- loan date;
- payment date;
- filter/context liên quan.

Nếu không xác định được month key, service có thể fallback các tháng fund gần nhất.

### 9.5. Pending fund jobs

Pending giao dịch Thu chi:

- có thể được hiển thị trong form/nhật ký;
- không được merge vào KPI overview;
- không được coi là transaction chính thức;
- chỉ reload cache/live data sau job `synced`.

## 10. `sync_status`

### 10.1. Schema contract

Primary key:

```text
sync_key
```

Columns:

- `sync_key text`;
- `module text`;
- `status text`;
- `message text`;
- `synced_at timestamptz`;
- `updated_at timestamptz`.

### 10.2. Ý nghĩa

Mỗi row phản ánh trạng thái gần nhất của một sync scope, ví dụ:

- report month;
- manage sheet/month;
- fund bundle;
- transport sheet change;
- startup/catalog.

`sync_status` không phải event log đầy đủ. Upsert cùng `sync_key` thay trạng thái trước đó.

### 10.3. Status

Code hiện ghi các trạng thái text theo sync operation. Consumer không nên suy diễn job lifecycle từ `sync_status`; write lifecycle nằm trong `write_jobs`.

### 10.4. Freshness

Độ tuổi được tính từ `synced_at`/`updated_at`. Một row cũ không tự chứng minh cache sai, nhưng là tín hiệu cần audit hoặc đọc live.

## 11. `write_jobs` schema contract

### 11.1. Identity và routing

| Column | Ý nghĩa |
| --- | --- |
| `id text` | Job ID/primary key |
| `module text` | `transport`, `fund`, ... |
| `action text` | Action worker phải thực thi |
| `payload jsonb` | Write intent bất biến về logic |
| `idempotency_key text` | Khóa chống enqueue trùng theo module |

Unique partial index:

```text
(module, idempotency_key)
WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
```

### 11.2. Lifecycle

| Column | Ý nghĩa |
| --- | --- |
| `status` | `pending`, `processing`, `synced`, `failed` |
| `attempts` | Số lần đã claim/thử xử lý |
| `max_attempts` | Giới hạn retry |
| `last_error` | Lỗi gần nhất |
| `next_run_at` | Thời điểm sớm nhất được claim |
| `locked_at` | Timestamp lock legacy/compatibility |
| `claimed_at` | Timestamp atomic claim hiện tại |
| `worker_id` | Worker đã claim |
| `synced_at` | Thời điểm job hoàn tất đồng bộ |

### 11.3. Result và timestamps

| Column | Ý nghĩa |
| --- | --- |
| `result jsonb` | Kết quả ghi Sheet/sync trả cho client |
| `created_at` | Thời điểm enqueue |
| `updated_at` | Thời điểm update gần nhất |

`result` chỉ đáng tin khi `status='synced'`. Job failed có thể có partial technical context nhưng không được coi là business success.

### 11.4. Status constraint

Chỉ chấp nhận:

```text
pending
processing
synced
failed
```

Không thêm status mới trong code trước khi có migration cập nhật constraint và frontend handling.

## 12. `write_job_logs` contract

Columns:

- `id bigserial`;
- `job_id` foreign key đến `write_jobs`;
- `status`;
- `message`;
- `details jsonb`;
- `created_at`.

Contract:

- log append-only theo sự kiện job;
- xóa job cascade xóa log;
- details không chứa secret;
- log dùng để chẩn đoán, không thay thế `write_jobs.status`;
- UI hiện không cần đọc toàn bộ log cho mọi job.

## 13. Action được phép queue

### 13.1. Feature flags

Các flag liên quan:

- `ASYNC_WRITE_ENABLED`: flag đại trà/legacy, hiện giữ false;
- `ASYNC_TRANSPORT_WRITE_ENABLED`: queue Vận tải;
- `ASYNC_FUND_TRANSACTION_ADD_ENABLED`: pilot thêm giao dịch Thu chi.

Không suy ra một flag bật nghĩa mọi action module đã queue.

### 13.2. Transport allowlist

Action hiện có:

- `transport/submitRows`;
- `transport/saveSheetRow`;
- `transport/deleteSheetRow` chỉ khi clear cột.

Sheet scope: `NL_*` được service công nhận.

### 13.3. Fund allowlist

Action hiện có:

- `fund/addFundTransactions`.

Không queue mặc định:

- update/delete transaction;
- add loan/payment;
- fund catalog writes.

### 13.4. Physical delete prohibition

Payload `transport/deleteSheetRow` phải có `columnsToClear` không rỗng.

Worker phải từ chối job yêu cầu physical `deleteRow()` vì:

- row index có thể dịch chuyển;
- retry có thể xóa dòng kế tiếp;
- idempotency theo row index không an toàn.

## 14. Enqueue contract

### 14.1. Validation trước enqueue

Trước khi tạo job:

- module/action phải nằm trong allowlist;
- feature flag phải bật;
- payload phải có scope hợp lệ;
- sheet phải thuộc module;
- `clientRequestId`/idempotency key phải hợp lệ;
- dữ liệu tối thiểu phải được validate đủ để không tạo job vô nghĩa.

### 14.2. Idempotency key

Nếu có idempotency key:

1. service tìm job cùng `(module,idempotency_key)`;
2. nếu đã có, trả job đó thay vì tạo mới;
3. nếu chưa có, insert job với ID ổn định/duy nhất;
4. unique index bảo vệ race condition.

Không dùng timestamp đơn thuần làm idempotency key nếu double-click có thể tạo hai timestamp khác nhau.

### 14.3. Enqueue response

Response logic:

```json
{
  "ok": true,
  "accepted": true,
  "queued": true,
  "jobId": "...",
  "status": "pending"
}
```

Ý nghĩa:

- `accepted`: write intent đã được lưu;
- `queued`: Google Sheet chưa chắc đã đổi;
- `jobId`: khóa poll/retry;
- `status`: trạng thái hiện tại.

Frontend không được báo “đã lưu vào Google Sheet” chỉ từ response này.

## 15. Atomic claim contract

### 15.1. RPC

Worker gọi:

```text
public.claim_write_jobs(p_limit, p_worker_id, p_stale_seconds)
```

RPC:

- chạy `security definer`;
- chỉ service role được execute;
- chọn job `pending` đến hạn;
- có thể reclaim `processing` đã stale;
- yêu cầu `attempts < max_attempts`;
- dùng `FOR UPDATE SKIP LOCKED`;
- giới hạn batch 1–20;
- update status/attempt/worker/timestamp trong cùng transaction;
- trả các row đã claim.

### 15.2. Stale processing

Job `processing` được xem là stale dựa trên:

```text
coalesce(claimed_at, locked_at, updated_at)
```

và timeout tối thiểu 60 giây.

Reclaim không có nghĩa write trước chưa xảy ra. Worker vẫn phải chạy idempotency check ở Google Sheet.

### 15.3. Worker concurrency

`SKIP LOCKED` cho phép nhiều worker claim các job khác nhau. Không được thay RPC bằng flow:

1. SELECT pending;
2. sau đó PATCH processing;

vì flow đó có race condition.

## 16. Worker execution contract

### 16.1. Quy trình chung

1. Kiểm tra queue enabled.
2. Tạo worker ID.
3. Atomic claim batch.
4. Normalize job row.
5. Dispatch theo `module/action`.
6. Thực hiện idempotency/concurrency check.
7. Ghi Google Sheet.
8. Kiểm tra write result.
9. Sync cache/report liên quan.
10. Update job `synced` với result.
11. Append log.
12. Nếu lỗi, lập lịch retry hoặc đánh `failed`.

### 16.2. Success boundary

Job chỉ được đánh `synced` sau khi:

- write Sheet được xác nhận hoặc idempotent replay xác nhận write đã tồn tại;
- các bước bắt buộc sau write hoàn tất theo implementation.

Nếu sync cache không được coi là fatal ở một path cụ thể, result phải ghi rõ trạng thái sync; không được che giấu lỗi làm người vận hành hiểu nhầm cache đã mới.

### 16.3. Error boundary

Khi lỗi:

- giữ `last_error` ngắn gọn, không chứa secret;
- append `write_job_logs`;
- nếu còn attempt, đặt lại `pending` và `next_run_at`;
- nếu hết attempt, `failed`;
- không xóa job để che lỗi;
- không tự tạo job mới với payload khác.

## 17. Idempotency Vận tải

### 17.1. Append

Contract:

- job ID được truyền xuống write context;
- range đã ghi được gắn Developer Metadata key `WRITE_JOB_ID`;
- trước append, service tìm metadata cùng job ID;
- nếu tìm thấy, trả `idempotentReplay=true`/range hiện có;
- nếu không, append và gắn metadata.

Metadata phải gắn đúng range chứa các row của job, không gắn toàn sheet.

### 17.2. Save row

Payload gồm:

- `sheetName`;
- `rowIndex`;
- `rowData` mới;
- `previousRowData`.

Trước ghi:

- đọc row live;
- nếu đã khớp `rowData` mới, có thể coi là replay thành công;
- nếu không khớp `previousRowData`, từ chối do concurrent modification;
- nếu khớp dữ liệu cũ, thực hiện update.

### 17.3. Clear columns

Payload gồm:

- `sheetName`;
- `rowIndex`;
- `columnsToClear`;
- dữ liệu row trước đó.

Replay an toàn khi các cột đã trống và row identity vẫn phù hợp. Không chuyển sang physical delete.

## 18. Idempotency Thu chi

### 18.1. Client request ID

Frontend gửi `clientRequestId` cho batch add.

Validation:

- không quá 200 ký tự;
- chỉ ký tự thuộc pattern `[A-Za-z0-9._:-]`;
- dùng để tạo idempotency key queue.

### 18.2. Stable voucher

Voucher được tạo trước/ổn định trong payload job. Retry không tạo seed voucher mới.

Trước append:

- tìm các voucher trong `NHAP_THUCHI`;
- nếu đủ toàn bộ voucher, trả idempotent replay;
- nếu chỉ tồn tại một phần, từ chối để tránh batch nửa cũ/nửa mới;
- nếu chưa có, append toàn batch.

### 18.3. Batch rollback

Nếu lỗi trong direct/worker append sau khi đã ghi một phần batch:

- rollback vùng vừa chèn theo contract `FundService`;
- giữ formula/validation của vùng ngoài batch;
- trả lỗi để job retry/failed.

Rollback không thay thế voucher check; cả hai đều cần thiết.

## 19. Retry contract

### 19.1. Automatic retry

Worker retry khi:

- job còn dưới `max_attempts`;
- lỗi được ghi nhận;
- `next_run_at` được đặt lại.

Attempts tăng khi claim, không chỉ khi write bắt đầu.

### 19.2. Manual retry

`retryWriteJob(jobId)` dành cho admin/operator qua API hiện tại.

Manual retry phải:

- kiểm tra job tồn tại;
- chỉ reset trạng thái phù hợp;
- không xóa history/attempt context ngoài contract;
- vẫn đi qua atomic claim và idempotency khi worker chạy lại.

### 19.3. Không retry mù

Khi lỗi xảy ra sau Sheet write nhưng trước job update, operator phải kiểm tra:

- Developer Metadata hoặc voucher;
- Google Sheet row thực tế;
- job log/result;
- cache status.

Không tạo lại giao dịch bằng UI nếu job cũ chưa được đối soát.

## 20. Pending state contract phía frontend

### 20.1. Transport jobs

Frontend có thể overlay job trạng thái:

- `pending`;
- `processing`;
- `failed`.

Không overlay job `synced` vào bảng nghiệp vụ vì dữ liệu thật phải đến từ Sheet/cache. Điều này tránh row đã bị xóa trực tiếp trong Sheet bị “sống lại” từ job history.

### 20.2. Optimistic rows

- Append: tạo row tạm chưa có `rowIndex` thật.
- Save: thay row cũ bằng dữ liệu mới tạm thời.
- Clear/delete: ẩn hoặc sửa row tạm thời.
- Pending row bị khóa edit/delete nếu chưa có identity thật an toàn.

### 20.3. Dashboard

Pending `NL_VanChuyen` có thể được merge vào latest trips để phản hồi nhanh. Nhãn trạng thái không được đưa vào ảnh báo cáo nếu UI đã quy định bảng export sạch.

### 20.4. Fund jobs

Pending fund transaction:

- hiển thị trong entry/job status;
- không cộng vào overview KPI;
- không merge thành transaction chính thức sau reload nếu chưa synced.

### 20.5. Sau synced

Frontend phải:

1. bỏ pending overlay;
2. invalidate browser/session cache liên quan;
3. reload Apps Script hoặc Supabase bundle mới;
4. render row thật có `rowIndex`/voucher/range đã xác nhận.

## 21. Sync sau worker write

### 21.1. `transport/submitRows`

Sau ghi:

- sync `manage_data_bundles.recent_500` cho sheet;
- sync manage month khi xác định được;
- `NL_VanChuyen`: sync dashboard/latest trips;
- sync report bundle tháng liên quan;
- có thể sync `Tất cả`.

### 21.2. `transport/saveSheetRow`

Month extraction phải xem cả:

- `rowData` mới;
- `previousRowData` nếu thay đổi tháng/ngày.

Cache cần làm mới có thể gồm cả tháng cũ và tháng mới.

### 21.3. `transport/deleteSheetRow`

Month extraction từ row bị clear. Sync:

- recent cache;
- tháng cũ;
- dashboard/report nếu `NL_VanChuyen`.

### 21.4. `fund/addFundTransactions`

Sau ghi:

- fund overview latest;
- fund transactions recent;
- overview/transactions từng tháng của payload;
- không mặc nhiên cần loan bundle nếu giao dịch không tác động loan data.

## 22. Trigger và scheduled sync

### 22.1. `syncRealtimeCache`

Contract:

- time-driven trigger mỗi phút sau khi cài;
- mỗi tick chạy một nhóm nhỏ;
- có runtime guard tránh chạy chồng;
- không phải full sync;
- ghi sync status.

Step families:

- dashboard;
- recent reports;
- report `Tất cả`;
- recent fund bundles;
- fund catalogs;
- startup/catalogs;
- từng manage sheet và recent months.

### 22.2. `syncFullRealtimeCache`

Contract:

- thao tác thủ công/backfill;
- chạy startup/catalog, dashboard, reports, fund và manage bundles;
- có thể kéo dài nhiều phút;
- không cài làm trigger phút;
- không gọi trong request người dùng.

### 22.3. Transport Sheet triggers

Handlers:

- `handleTransportSheetEdit(e)`;
- `handleTransportSheetChange(e)`.

Scope:

- file Vận tải được chỉ định;
- chỉ `NL_*`;
- edit: recent + month từ range;
- change: recent + recent months;
- `NL_VanChuyen`: dashboard;
- unknown sheet fallback: `NL_VanChuyen` hẹp.

### 22.4. Write job trigger

`installWriteJobTrigger()` cài trigger gọi worker. Trigger chỉ có ý nghĩa khi queue enabled và migration RPC đã tồn tại.

Không cài nhiều trigger trùng handler.

## 23. Freshness contract

### 23.1. Không có SLA tuyệt đối trong code hiện tại

Hệ thống dùng near-realtime/eventual consistency. `synced_at` phản ánh lần sync thực tế, không cam kết cache luôn mới trong một số giây cố định.

### 23.2. Freshness signals

Consumer/operator dùng:

- bundle `synced_at`;
- `sync_status`;
- write job status;
- audit result;
- live Apps Script read;
- Google Sheet trực tiếp.

### 23.3. Force refresh

`forceRefresh` thường bỏ qua một số cache backend/frontend, nhưng không tự động bảo đảm mọi Supabase bundle đã được upsert. Force read live và sync cache là hai thao tác khác nhau.

### 23.4. Stale cache response

Nếu cache tồn tại nhưng stale theo audit:

- frontend hiện không tự động chạy audit ở mọi read;
- operator có thể force live read hoặc sync hẹp;
- không sửa Google Sheet theo cached payload.

## 24. Cache invalidation contract

### 24.1. Runtime/report cache

`SheetService.invalidateCaches()`:

- tăng data/report version;
- xóa chunked/runtime caches;
- làm `SYS_ReportCache` cũ không còn khớp version.

### 24.2. Browser cache

Sau write/refresh:

- xóa session key theo prefix;
- tăng report cache epoch;
- bỏ cached payload có `ok:false`;
- reload nguồn thật sau job synced.

### 24.3. Supabase cache

Supabase bundle không bị invalidated chỉ bằng cách tăng Apps Script cache version. Phải upsert bundle mới hoặc xóa bundle để frontend fallback.

### 24.4. Xóa cache

Nếu bundle sai:

- có thể xóa row/table cache theo runbook;
- không xóa Google Sheet;
- không xóa write jobs chưa đối soát;
- sau xóa, frontend fallback live hoặc chờ backfill.

## 25. RLS và bảo mật

### 25.1. Read policy

Sau migration authenticated cutover:

- anon không được đọc cache/queue;
- authenticated chỉ đọc khi `public.is_active_app_user()` true;
- `app_users` chỉ cho user đọc profile của chính mình theo policy;
- Apps Script/Vercel server dùng service role cho write/admin operation.

### 25.2. Browser limitations

Browser:

- được có Supabase URL và anon key;
- dùng user JWT cho REST read;
- không có service role key;
- không insert/update cache hoặc job trực tiếp;
- enqueue qua Apps Script API để backend validate.

### 25.3. RPC permissions

`claim_write_jobs`:

- revoke khỏi public/anon/authenticated;
- chỉ grant `service_role`.

Không mở RPC claim cho browser user.

## 26. Migration contract

Migration hiện theo thứ tự:

1. `001_report_bundles.sql`;
2. `002_realtime_cache.sql`;
3. `003_startup_catalog_cache.sql`;
4. `004_manage_data_cache.sql`;
5. `005_write_jobs.sql`;
6. `006_write_queue_hardening.sql`;
7. `007_auth_hardening.sql`;
8. `008_authenticated_read_cutover.sql`;
9. `009_shareholder_role.sql`.

Rules:

- không sửa migration đã apply;
- migration mới dùng số tiếp theo;
- phải tương thích dữ liệu hiện có;
- thay status/role constraint phải xử lý row hiện tại;
- RLS migration phải test anon/authenticated/service role;
- worker change phụ thuộc schema phải deploy sau migration tương ứng;
- rollback bằng migration mới hoặc feature flag, không xóa lịch sử migration.

## 27. Failure modes chính

### 27.1. Sheet write thành công, cache sync lỗi

Trạng thái:

- Google Sheet đã đúng;
- Supabase cache cũ;
- job có thể chưa `synced`.

Xử lý:

- kiểm tra idempotency marker;
- không append lại mù;
- sync hẹp cache;
- update/retry job theo evidence.

### 27.2. Enqueue thành công, worker không chạy

Trạng thái: job `pending`, Sheet chưa đổi.

Kiểm tra:

- write trigger;
- queue flag;
- RPC migration;
- `next_run_at`;
- service role config;
- worker log.

### 27.3. Job processing bị treo

Sau stale timeout, RPC có thể reclaim. Idempotency check bắt buộc vì worker cũ có thể đã ghi trước khi chết.

### 27.4. Partial fund voucher existence

Nếu một phần voucher batch đã tồn tại:

- không append phần còn lại tự động;
- đánh lỗi để đối soát;
- kiểm tra rollback/job history/Sheet.

### 27.5. Cache payload `ok:false`

- frontend reject và xóa session cache lỗi;
- fallback Apps Script;
- sync lại Supabase bundle sau khi sửa nguyên nhân.

### 27.6. Job `synced` overlay dữ liệu cũ

Không overlay `synced` jobs vào manage/dashboard. Dữ liệu chính thức phải đến từ Sheet/cache hiện tại.

## 28. Observability checklist

Khi kiểm tra một lỗi queue/cache:

1. Ghi lại action, module, sheet/year/month.
2. Xác định browser đang render cache, live hay optimistic data.
3. Kiểm tra `jobId` và status.
4. Kiểm tra attempts, last error và timestamps.
5. Kiểm tra `write_job_logs`.
6. Kiểm tra row/voucher/metadata trong Google Sheet.
7. Kiểm tra `sync_status` scope liên quan.
8. Kiểm tra bundle key và `synced_at`.
9. Chạy audit phù hợp nếu cần.
10. Force live read để xác định source data.
11. Sync hẹp cache.
12. Chỉ retry sau khi xác định idempotency guard sẽ xử lý đúng.

## 29. Quy tắc mở rộng cache

Khi thêm cache bundle mới:

1. Xác định rõ source of truth.
2. Chọn primary key ổn định.
3. Định nghĩa key namespace và normalize helper ở backend/frontend.
4. Định nghĩa payload owner và versioning strategy.
5. Tạo migration mới với RLS/trigger/index.
6. Chỉ service role được write.
7. Thêm frontend fallback live.
8. Định nghĩa sync sau write.
9. Định nghĩa scheduled/backfill sync.
10. Định nghĩa audit/freshness signal.
11. Định nghĩa rollback bằng feature flag/xóa cache.
12. Cập nhật tài liệu và test.

Không thêm cache nếu không xác định được invalidation/sync owner.

## 30. Quy tắc mở rộng queue

Khi thêm queued action:

1. Xác định tại sao request cần async.
2. Xác định action/sheet/module allowlist.
3. Thiết kế payload bất biến, đủ để retry.
4. Thiết kế idempotency key ở queue.
5. Thiết kế idempotency marker/check tại source of truth.
6. Thiết kế optimistic UI và restore after reload.
7. Xác định concurrent modification rule.
8. Cấm queue nếu physical identity không ổn định.
9. Định nghĩa worker result.
10. Định nghĩa cache/report sync sau write.
11. Định nghĩa partial failure/rollback.
12. Thêm feature flag riêng và mặc định an toàn.
13. Test double-click, retry, stale worker và timeout sau write.
14. Test role/proxy enforcement.
15. Cập nhật API/data-flow/runbook docs.

## 31. Contract test tối thiểu

Queue/cache change phải kiểm tra:

- migration syntax/constraint/RLS;
- atomic claim dùng `FOR UPDATE SKIP LOCKED`;
- unique idempotency index;
- action allowlist và feature flag;
- queue disabled behavior;
- duplicate enqueue trả cùng logical job;
- duplicate worker execution không ghi trùng;
- queued save từ chối stale row;
- queued physical delete bị từ chối;
- fund voucher full replay/partial conflict;
- pending không vào KPI;
- synced job không overlay row;
- cache key backend/frontend khớp;
- payload `ok:false` fallback;
- sync đúng recent/month/dashboard/report;
- anon bị RLS chặn;
- authenticated active user đọc được;
- shareholder không gọi queue/audit action qua proxy.

## 32. Trạng thái tài liệu

- Loại tài liệu: cache và write queue contract hiện trạng.
- Phạm vi: Supabase schema, Apps Script sync/worker, frontend cache/pending state và RLS liên quan.
- Nguồn kiểm chứng: `SupabaseService.gs`, `next-shell/components/entry/`, `next-shell/components/cashflow/`, `next-shell/lib/platform/`, Supabase migrations và contract tests.
- Ngày xác nhận gần nhất: 2026-07-13 (D1).
- Cần cập nhật khi: thêm/đổi bảng, key, payload, sync step, feature flag, job action/status, retry, idempotency, RLS hoặc pending UI behavior.
