# KNOWN_RISKS

## Phase B1 — Next.js Report

- Route `/next-accounts/reports/` dùng API `getReportBundle` hiện có và không tạo Apps Script action mới.
- Workbook Vận tải được resolve phía server từ allowlist A2; browser interaction đi qua `/next-accounts/report-data/` và không được gửi workbook ID tùy ý.
- Initial bundle được tải ở Server Component. Client chỉ giữ interaction state cho tab/search/month/refresh/export.
- Responsive visual QA đạt đủ 5 viewport ngày 2026-07-13. Project canary không kết nối Git; các `Error Stale` cũ do build/output root sai không ảnh hưởng stable alias đang `READY`.

## 1. Mục đích và phạm vi

Tài liệu này là risk register hiện trạng của hệ thống Vận tải Đông Bắc.

Mục tiêu:

- giúp người phát triển và Coding Agent nhận biết vùng rủi ro trước khi thay đổi;
- phân biệt lỗi đã có kiểm soát với rủi ro chưa được xử lý hoàn toàn;
- ghi dấu hiệu nhận biết, tác động và cách phản ứng an toàn;
- tránh lặp lại các sự cố đã từng xuất hiện;
- hỗ trợ ưu tiên kiểm thử mà không tự động biến risk register thành backlog refactor.

Tài liệu không phê duyệt sửa code, không kết luận mọi rủi ro phải xử lý ngay và không thay thế incident/runbook chi tiết.

## 2. Thang đánh giá

### 2.1. Mức tác động

| Mức | Ý nghĩa |
| --- | --- |
| Critical | Có thể mất/sai dữ liệu, lộ secret, phá quyền truy cập hoặc sai báo cáo tài chính nghiêm trọng |
| High | Ảnh hưởng nghiệp vụ chính, nhiều người dùng hoặc khó phục hồi thủ công |
| Medium | Ảnh hưởng cục bộ, có workaround/fallback nhưng gây nhầm lẫn hoặc tốn vận hành |
| Low | Nhiễu, maintainability hoặc rủi ro nhỏ chưa ảnh hưởng trực tiếp dữ liệu |

### 2.2. Khả năng xảy ra

| Mức | Ý nghĩa |
| --- | --- |
| High | Đã từng xảy ra hoặc có đường code thường xuyên kích hoạt |
| Medium | Có điều kiện rõ ràng và có thể gặp trong vận hành bình thường |
| Low | Cần điều kiện hiếm hoặc nhiều lớp bảo vệ cùng thất bại |

### 2.3. Trạng thái

- Open: rủi ro còn tồn tại, chưa có kiểm soát đủ.
- Mitigated: đã có kiểm soát làm giảm rủi ro nhưng chưa loại bỏ.
- Accepted: kiến trúc hiện chấp nhận có chủ ý.
- Monitor: cần quan sát/đối soát định kỳ.
- Documentation gap: chủ yếu do tài liệu hoặc ownership chưa rõ.

Không đánh dấu Closed nếu source/kiến trúc vẫn còn đường tái diễn.

## 3. Bảng tổng hợp ưu tiên

| ID | Rủi ro | Tác động | Khả năng | Trạng thái |
| --- | --- | --- | --- | --- |
| R-001 | Ghi đè công thức/cột helper Google Sheets | Critical | Medium | Mitigated/Monitor |
| R-002 | Ghi hoặc xóa nhầm row do `rowIndex` dịch chuyển | Critical | Medium | Mitigated |
| R-003 | Retry tạo giao dịch trùng | Critical | Medium | Mitigated/Monitor |
| R-004 | Báo cáo web sai nghĩa hoặc sai số so với Sheet | Critical | Medium | Mitigated/Monitor |
| R-005 | Supabase cache cũ che dữ liệu Sheet mới | High | High | Mitigated/Accepted |
| R-006 | Sheet write thành công nhưng request/job báo lỗi | High | Medium | Mitigated |
| R-007 | Bound script Thu chi bypass web queue/RBAC/sync | High | Medium | Accepted/Monitor |
| R-008 | Schema drift giữa source, docs, snapshot và production | High | High | Documentation gap |
| R-009 | Service role/proxy secret bị lộ | Critical | Low | Mitigated |
| R-010 | Apps Script direct API bị mở khi Auth rollback/enforcement tắt | Critical | Medium | Monitor |
| R-011 | Permission drift giữa UI, proxy và RLS | High | Medium | Mitigated/Monitor |
| R-012 | Frontend global dependency gây lỗi chéo | High | Medium | Removed from current source/Monitor rollback only |
| R-013 | `SheetService`/`SupabaseService` có blast radius lớn | High | Medium | Accepted |
| R-014 | Apps Script timeout trong report/full sync | High | High | Mitigated/Accepted |
| R-015 | Sheet tạm báo cáo còn sót | Medium | Medium | Mitigated |
| R-016 | `IMPORTRANGE` trễ/lỗi làm báo cáo Vận tải cũ | High | Medium | Monitor |
| R-017 | Timezone bound Thu chi không khớp hệ thống | High | Medium | Open/Unverified |
| R-018 | Queue/trigger bị cài thiếu hoặc trùng | High | Medium | Mitigated/Monitor |
| R-019 | Test coverage thiên về syntax/regex | High | High | Open |
| R-020 | `index.html` artifact bị sửa trực tiếp hoặc build lệch | Medium | Medium | Mitigated |
| R-021 | `node_modules` và binary được track trong Git | Medium | High | Open |
| R-022 | Dữ liệu nhạy cảm trong cache đọc được bởi mọi active role | High | Medium | Monitor |
| R-023 | Direct Google Sheet edit nằm ngoài web RBAC | High | High | Accepted/Monitor |
| R-024 | Full backfill chạy trong request/trigger ngắn | High | Medium | Mitigated |
| R-025 | Thay danh mục lịch sử làm đổi báo cáo cũ | Critical | Medium | Open/Process control |
| R-026 | Hard-coded năm 2026 trong call site Thu chi | High | Medium | Open |
| R-027 | GET có side effect bị prefetch/retry | High | Low | Mitigated/Monitor |
| R-028 | Optimistic row bị coi là dữ liệu đã ghi | High | Medium | Mitigated |
| R-029 | Job `synced` làm sống lại row đã xóa | High | Low | Mitigated |
| R-030 | Source bound script snapshot không khớp production | High | High | Documentation gap |
| R-031 | Report `latest`/lọc total sai semantics và prefetch route trùng | High | Medium | Mitigated/Monitor |
| R-032 | Chuyển route không có phản hồi tức thời và thao tác thiếu toast | Medium | High | Mitigated/Monitor |

## 4. Rủi ro dữ liệu Google Sheets

### R-001 — Ghi đè công thức hoặc cột helper

Tác động: Critical. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Mô tả:

Các sheet `NL_*`, `NHAP_THUCHI`, `NHAP_VAY` có cột công thức/helper nằm xen kẽ hoặc phía sau vùng nghiệp vụ. Generic full-row write có thể biến formula thành value hoặc clear formula.

Dấu hiệu:

- cột Tháng không tự tính;
- Thành tiền/dư nợ/filter trống;
- báo cáo mất row hoặc sai tổng;
- formula count giảm;
- row mới khác format/validation dòng trước.

Kiểm soát hiện có:

- write theo segment, skip cột;
- copy format/công thức từ dòng trước;
- không apply number format rộng sau write;
- spreadsheet contract ghi rõ vùng helper.

Phản ứng an toàn:

1. Dừng write action liên quan.
2. So sánh formula row lỗi với row trước/sau.
3. Không fill formula diện rộng trên production khi chưa kiểm tra.
4. Khôi phục từ template/backup.
5. Đối soát downstream report.

### R-002 — Row index dịch chuyển gây sửa/xóa nhầm

Tác động: Critical. Khả năng: Medium. Trạng thái: Mitigated.

Mô tả:

UI/API dùng `rowIndex` Google Sheet. Physical delete làm mọi row phía dưới dịch chuyển. Queued retry theo index cũ có thể tác động row khác.

Kiểm soát hiện có:

- physical delete chạy direct;
- queue delete chỉ clear columns;
- queued save/delete mang previous row data;
- pending row chưa có identity thật bị khóa.

Khoảng trống:

- direct edit/delete vẫn có race giữa load và submit;
- người dùng có thể xóa/sort row trực tiếp trong Sheet.

Phản ứng:

- kiểm tra row live trước ghi;
- không retry physical delete;
- force reload sau delete;
- dùng stable business identity khi điều tra.

### R-003 — Retry tạo giao dịch trùng

Tác động: Critical. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Nguồn:

- double-click;
- HTTP retry;
- worker stale được reclaim;
- Sheet ghi xong nhưng job update lỗi;
- người dùng nhập lại vì chưa thấy cache.

Kiểm soát:

- queue idempotency key;
- atomic claim;
- Developer Metadata `WRITE_JOB_ID` cho Vận tải append;
- stable voucher và voucher lookup cho Thu chi;
- không dùng GET để ghi;
- pending UI/job history.

Khoảng trống:

- direct write paths không có cùng mức idempotency;
- thao tác bound script/bot nằm ngoài queue;
- metadata/voucher có thể bị người dùng sửa/xóa trực tiếp.

### R-025 — Sửa danh mục lịch sử làm thay đổi báo cáo cũ

Tác động: Critical. Khả năng: Medium. Trạng thái: Open/Process control.

Mô tả:

Danh mục dự án, đơn giá, giá dầu, lương, thưởng/phạt và nhân sự ảnh hưởng công thức lịch sử. Sửa đè row cũ thay vì thêm mốc hiệu lực có thể thay số liệu tháng đã chốt.

Kiểm soát hiện có:

- schema có effective-date rules ở một số danh mục;
- quy tắc không đổi cấu trúc;
- báo cáo audit/cache comparison.

Phản ứng:

- tạo row hiệu lực mới;
- đối chiếu các tháng cũ trước/sau;
- không force sync cache mới nếu live Sheet đã bị thay lịch sử ngoài ý muốn;
- khôi phục danh mục trước rồi sync lại.

## 5. Rủi ro báo cáo

### R-004 — Báo cáo web sai nghĩa hoặc sai số

Tác động: Critical. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Sự cố đã quan sát:

- frontend từng tự dựng lại bảng tổng quan/chi tiết;
- tên danh mục bị tự đặt lại;
- match chữ `lương` nhầm trong `khối lượng`;
- bundle tháng bị lặp số liệu tháng khác;
- controller tháng có nguy cơ làm báo cáo gốc nhảy.

Kiểm soát hiện có:

- render trực tiếp matrix từ Sheet/backend;
- match header cụ thể hơn;
- tính tháng qua sheet tạm;
- report audit theo hash;
- quy tắc ưu tiên đúng số liệu hơn tốc độ.

Yêu cầu kiểm soát:

- đối chiếu ít nhất các tháng đại diện và `Tất cả`;
- không tối ưu/parser lại trước khi có fixture số liệu;
- cache sync không thay thế đối soát live Sheet.

### R-031 — Report latest, total rows và route prefetch lệch contract

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Sự cố đã quan sát sau C3 cut-forward:

- dùng generic total-row detector cho Báo cáo chi tiết làm mất `Tổng khối lượng`, `Tổng doanh thu`, `Lợi nhuận thực`;
- alias `latest` lấy row Supabase sync gần nhất, kể cả snapshot Dashboard `__dashboard_latest__`, thay vì bundle của tháng nghiệp vụ mới nhất;
- filter công ty/biển số có thể stale sau đổi matrix;
- pointer/focus cùng prefetch một route, cộng thêm auth/API hop làm Next chậm hơn SPA legacy đã giữ data trong memory.

Kiểm soát:

- detail render nguyên source rows; chỉ finance/payroll/vehicles được loại total nguồn trước khi tính subtotal;
- loại `__dashboard_latest__` khỏi Report lookup, resolve actual latest month từ overview rồi đọc exact `report_month` theo workbook; cache không có matrix tháng phải fallback;
- filter value phải tồn tại trong option hiện tại;
- auth memoize trong request, cache read sau auth, intent-prefetch dedupe;
- luôn retest authenticated desktop/mobile và so latency thực tế trước cut-forward.

### R-032 — Route/action không có phản hồi tức thời

Tác động: Medium. Khả năng: High. Trạng thái: Mitigated/Monitor.

Sự cố đã quan sát trong C3 production stabilization:

- route Next động phải chờ server/data nên khi item menu không đổi state ngay, người dùng cảm giác thao tác bị khựng hoặc không nhận;
- các module dùng status text cục bộ không nhất quán, đặc biệt trên mobile hoặc khi popup đóng, khiến refresh/export/write/audit có vẻ không phản hồi;
- tăng prefetch hàng loạt để che latency có thể gọi đồng thời các route dữ liệu nặng và tái diễn R-027/R-031.

Kiểm soát:

- active/pending/progress phải xuất hiện ngay tại AppShell, không đợi route server trả về;
- chỉ prefetch theo intent và dedupe; không tuyên bố cải thiện network latency nếu chưa đo authenticated;
- dùng một toast contract toàn cục cho loading/success/error của thao tác chủ động, giữ đúng ngôn ngữ pending so với synced;
- toast phải có `aria-live`, error alert, dismiss, timeout phù hợp và reduced-motion;
- retest mobile/desktop trên preview trước promote, production giữ deployment rollback bất biến.

### R-015 — Sheet tạm báo cáo còn sót

Tác động: Medium. Khả năng: Medium. Trạng thái: Mitigated.

Nguồn: Apps Script timeout/error giữa `copyTo()` và cleanup.

Kiểm soát:

- `finally` delete;
- cleanup trước tính;
- nhận diện cả tên `_TMP_*` và tên copy mặc định;
- function cleanup thủ công.

Rủi ro còn lại:

- cleanup theo pattern có thể xóa sheet người dùng đặt tên giống pattern;
- nhiều execution cạnh tranh có thể cùng cleanup.

### R-016 — `IMPORTRANGE` trễ/lỗi

Tác động: High. Khả năng: Medium. Trạng thái: Monitor.

Mô tả:

Thu chi thay đổi trước, `IMP_ThuChi`/công thức Vận tải cập nhật sau. Nếu report cache sync quá sớm, bundle mới vẫn chứa số cũ.

Dấu hiệu:

- Sheet Thu chi đúng nhưng `IMP_ThuChi` thiếu row;
- live `BC_TongQuan` cũ;
- sync report thành công kỹ thuật nhưng số chưa đổi.

Phản ứng:

- kiểm tra quyền/refresh của `IMPORTRANGE`;
- đợi công thức ổn định;
- đối chiếu live report;
- sync lại đúng tháng.

## 6. Rủi ro cache và nhất quán

### R-005 — Cache cũ che dữ liệu Sheet mới

Tác động: High. Khả năng: High. Trạng thái: Mitigated/Accepted.

Nguồn:

- sync sau write lỗi/trễ;
- trigger không chạy;
- browser session cache;
- bundle tháng thiếu;
- bound script/direct Sheet edit không kick sync;
- job synced nhưng frontend chưa reload.

Kiểm soát:

- Supabase-first có fallback;
- reject payload `ok:false`;
- browser invalidation;
- sync hẹp sau write;
- trigger tick và Sheet edit/change;
- sync status/audit;
- force live read.

Accepted aspect: kiến trúc dùng eventual consistency, không cam kết realtime tuyệt đối.

### R-006 — Sheet write thành công nhưng job/request báo lỗi

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated.

Nguồn:

- lỗi format sau setValues;
- cache sync lỗi;
- timeout sau write;
- update job/log lỗi.

Hậu quả: người dùng retry và tạo duplicate nếu không kiểm tra source.

Kiểm soát:

- bỏ apply format rủi ro;
- idempotency metadata/voucher;
- job status/log;
- frontend pending state.

Quy tắc phản ứng: lỗi response không chứng minh Sheet chưa ghi.

### R-024 — Full backfill chạy sai context

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated.

Nguồn:

- gọi `syncFullRealtimeCache()` trong request;
- dùng full sync làm trigger phút;
- audit button vô tình chạy mọi audit/full sync.

Kiểm soát:

- tách tick nhỏ và full backfill;
- nút status/audit tách riêng;
- tài liệu workflow.

### R-028 — Optimistic row bị coi là dữ liệu chính thức

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated.

Kiểm soát:

- nhãn/spinner pending;
- khóa edit/delete row chưa có rowIndex;
- fund pending không vào KPI;
- reload nguồn thật khi synced.

Rủi ro còn lại: export/ảnh/tổng hợp frontend có thể vô tình tính pending nếu consumer mới không lọc đúng.

### R-029 — Job synced làm sống lại row đã xóa

Tác động: High. Khả năng: Low. Trạng thái: Mitigated.

Sự cố đã quan sát: frontend từng overlay cả job `synced`; row đã bị xóa trực tiếp trong Sheet xuất hiện lại từ job history.

Kiểm soát hiện tại: chỉ overlay pending/processing/failed.

Regression test cần bảo vệ rule này.

## 7. Rủi ro queue và worker

### R-018 — Trigger worker/sync thiếu hoặc trùng

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Thiếu trigger:

- job pending không được xử lý;
- cache không cập nhật định kỳ.

Trùng trigger:

- tăng quota;
- nhiều worker/tick chạy gần nhau;
- sync/write contention.

Kiểm soát:

- installer kiểm tra/xóa handler cũ;
- atomic claim;
- runtime lock/cache guard;
- status UI.

### R-003 liên quan worker stale

Worker stale có thể được reclaim. Đây là cần thiết để phục hồi nhưng chỉ an toàn khi source write có idempotency guard. Không thêm queued action nếu chưa có guard ở Google Sheet.

### Partial fund batch

Nếu chỉ một phần voucher đã tồn tại, tự append phần còn lại có thể tạo batch không xác định nguồn. Contract hiện yêu cầu lỗi/đối soát thay vì tự vá.

## 8. Rủi ro Auth, RBAC và secret

### R-009 — Lộ secret server-side

Tác động: Critical. Khả năng: Low. Trạng thái: Mitigated.

Secrets:

- Supabase service role key;
- `APP_PROXY_SECRET`;
- credential local;
- password/token.

Kiểm soát:

- không prefix `VITE_` cho server secret;
- `.env*`, `.clasp.json`, `client_secret.json` ignored;
- browser chỉ có anon key;
- proxy không `console.log` payload/user secret;
- RPC claim chỉ service role.

Incident: rotate ngay ở mọi environment và kiểm tra log/audit.

### R-010 — Direct Apps Script API bị mở

Tác động: Critical. Khả năng: Medium. Trạng thái: Monitor.

Nguồn:

- `AUTH_ENFORCEMENT_ENABLED=false`;
- proxy secret mismatch dẫn tới rollback vội;
- deployment `ANYONE_ANONYMOUS`;
- frontend cũ gọi Apps Script URL trực tiếp.

Kiểm soát:

- SecurityService shared-secret gate;
- production proxy;
- auth rollout/rollback sequence;
- direct-call smoke test.

### R-011 — Permission drift

Tác động: High. Khả năng: Medium. Trạng thái: Mitigated/Monitor.

Nguồn phân tán:

- UI helpers;
- `SHAREHOLDER_ACTIONS`;
- account handler;
- SQL role/RLS;
- tests;
- Sheet sharing.

Kiểm soát:

- RBAC matrix;
- proxy deny-by-default cho shareholder;
- contract và production smoke tests.

### R-022 — Cache visibility rộng giữa active roles

Tác động: High. Khả năng: Medium. Trạng thái: Monitor.

RLS hiện kiểm tra active user nhưng không tách table/payload theo role. Shareholder có thể direct REST select bảng được grant dù proxy không expose action tương ứng.

Kiểm soát:

- cache không chứa secret;
- account management không nằm trong cache tables;
- JWT/active allowlist required.

Nếu xuất hiện dữ liệu chỉ admin/operator được thấy, phải thiết kế role-aware RLS hoặc tách payload, không chỉ ẩn menu.

### R-023 — Direct Sheet edit ngoài web RBAC

Tác động: High. Khả năng: High. Trạng thái: Accepted/Monitor.

Web role không điều khiển Google Drive sharing. Người edit Sheet có thể bypass queue/proxy.

Kiểm soát phải nằm ở:

- Drive permissions;
- protected ranges;
- bound project permissions;
- trigger ownership;
- audit/backup.

## 9. Rủi ro bound script và Thu chi

### R-007 — Bound script bypass web controls

Tác động: High. Khả năng: Medium. Trạng thái: Accepted/Monitor.

Bound menu/macro/onEdit:

- ghi trực tiếp Sheet;
- không tạo write job;
- không enforce `app_users` role;
- không sync fund cache ngay theo snapshot.

Phản ứng: xác định nguồn write trước khi điều tra job/cache.

### R-017 — Timezone không khớp

Tác động: High. Khả năng: Medium. Trạng thái: Open/Unverified.

Manifest snapshot bound Thu chi dùng `America/New_York`; hệ thống chính dùng `Asia/Saigon`.

Rủi ro:

- voucher timestamp sai ngày;
- filter hôm nay/hôm qua lệch;
- date serialization lệch;
- trigger chạy khác kỳ.

Không tự đổi trước khi xác minh live và dữ liệu lịch sử.

### R-030 — Snapshot bound source không khớp production

Tác động: High. Khả năng: High. Trạng thái: Documentation gap.

Repository chưa ghi project ID/version/deployment tương ứng của bound script. Sửa snapshot có thể không thay production; deploy snapshot có thể ghi đè code mới hơn.

Kiểm soát: export live, diff, xác nhận trigger/drawing trước mọi thay đổi.

### External bot/automation không đầy đủ source

`BOT_USERS`, `BOT_MEDIA`, `BOT_LOG` cho thấy bot legacy từng ghi file Thu chi. Chưa xác nhận bot còn hoạt động. Đây là external writer tiềm năng cần kiểm tra khi xuất hiện row không qua web/bound UI.

## 10. Rủi ro kiến trúc và maintainability

### R-012 — Frontend global dependency

Tác động: High. Khả năng: Medium. Trạng thái: Removed from current source/Monitor rollback only.

Đặc điểm:

- global variables/functions;
- dependency theo thứ tự include;
- DOM ID contract ngầm;
- state dùng chung giữa view;
- không type checking/import graph.

Sự cố tiềm năng:

- rename function làm view khác lỗi;
- load order lỗi;
- stale state giữa tab;
- event handler gọi helper chưa tồn tại;
- CSS selector ảnh hưởng nhiều module.

Kiểm soát hiện có: D1 đã xóa browser-global fragments, DOM bridge và island flags; production dùng Next import graph, lint, typecheck và build. Rủi ro chỉ còn trong deployment legacy bất biến dùng cho rollback.

### R-013 — Service blast radius lớn

Tác động: High. Khả năng: Medium. Trạng thái: Accepted.

`SheetService.gs` và `SupabaseService.gs` chứa nhiều trách nhiệm. Facade mới không đồng nghĩa implementation đã tách.

Hệ quả:

- thay helper chung ảnh hưởng nhiều module;
- khó test isolation;
- dễ tạo circular behavioral dependency;
- Agent có thể đánh giá thiếu call chain.

Kiểm soát: module map, call-site search, thay đổi nhỏ, test theo ma trận ảnh hưởng.

### R-008 — Schema/document drift

Tác động: High. Khả năng: High. Trạng thái: Documentation gap.

Ví dụ:

- tài liệu cũ nói Thu chi chưa tích hợp;
- `DM_PhanCongLaiXe`/`XL_NgoaiLe` được nhắc nhưng không có trong snapshot mới;
- số cột config khác số cột vật lý;
- deployment history và current state trộn trong context.

Kiểm soát mới: bộ docs Phase 1, source-priority rule và documentation policy dự kiến.

### R-026 — Hard-coded năm 2026

Tác động: High. Khả năng: Medium. Trạng thái: Open.

Frontend Thu chi có nhiều call site truyền `'2026'`. Kiến trúc hỗ trợ file theo năm nhưng UX/runtime chưa hoàn toàn year-dynamic.

Rủi ro khi sang năm:

- ghi nhầm file 2026;
- cache key sai year;
- danh mục/form options cũ;
- report giữa hai năm trộn context.

Không tự thay hard-code nếu chưa có yêu cầu thiết kế year selector/cutover.

## 11. Rủi ro Apps Script và vận hành

### R-014 — Timeout

Tác động: High. Khả năng: High. Trạng thái: Mitigated/Accepted.

Các operation nặng:

- full report sync;
- full manage sync;
- report month qua sheet copy;
- audit nhiều kỳ/sheet;
- large range read/write.

Kiểm soát:

- tick luân phiên;
- sync hẹp;
- queue worker batch;
- tách audit khỏi status load;
- cleanup sheet tạm;
- không full sync trong request.

### R-018 — Trigger ownership/quota

Installable trigger chạy dưới owner. Nếu owner mất quyền/file ownership đổi, trigger có thể ngừng. Apps Script quota cũng có thể làm tick/worker trễ.

Phải ghi nhận owner, handler, interval và lần chạy gần nhất trong runbook.

### Lock contention

Cache sync và worker dùng lock/guard. Lock quá rộng hoặc execution chết có thể làm step bị skip. Skip có thể hợp lệ để tránh chạy chồng nhưng làm freshness trễ.

## 12. Rủi ro build và repository

### R-020 — Artifact build lệch source

Tác động: Medium. Khả năng: Medium. Trạng thái: Mitigated.

Nguồn:

- sửa `client_*.html` nhưng không build;
- sửa trực tiếp `index.html`;
- build bằng env khác;
- commit source/artifact không cùng version.

Kiểm soát:

- workflow chỉ sửa source fragments;
- `next build` là build frontend duy nhất;
- lint/typecheck/test chạy trên source Next;
- Vercel build command khóa tại `npm run build:next-accounts`.

### R-021 — `node_modules`/binary được track

Tác động: Medium. Khả năng: High. Trạng thái: Open.

Repository hiện track `node_modules`, gồm native binary `sharp/libvips` cho macOS ARM.

Tác động:

- repository lớn/nhiễu;
- Agent search đọc dependency thay source;
- binary khác platform;
- diff/security review khó;
- dependency state không được mô tả bằng lockfile chuẩn rõ ràng.

Không tự xóa trong Phase tài liệu. Cần quyết định repository hygiene riêng.

### Local secret files

`.env.local`, `.env.production.local`, `.clasp.json`, `client_secret.json` tồn tại local nhưng được ignore. Rủi ro vẫn còn nếu dùng `git add -f`, copy nội dung vào log hoặc commit file backup khác tên.

## 13. Rủi ro API

### R-027 — GET có side effect

Tác động: High. Khả năng: Low. Trạng thái: Mitigated/Monitor.

`submitRowsGet` đã bị tắt sau sự cố retry ghi trùng. Tuy nhiên:

- `invalidateCaches` vẫn là GET có side effect;
- report GET có thể tạo sheet tạm/ghi technical cache.

Không thêm write business action bằng GET. Không để browser prefetch action side-effect.

### Route duplication

Action được định nghĩa ở Router, `invokeApi`, proxy và frontend. Thêm action thiếu một lớp có thể:

- direct path chạy nhưng proxy path lỗi;
- quyền sai;
- GET/POST mismatch;
- shareholder bị mở/chặn ngoài ý muốn.

API contract và checklist phải được dùng khi thay đổi.

### Payload size

Proxy giới hạn 1 MiB. Batch quá lớn bị 413 trước Apps Script. Apps Script cũng có execution/quota limits. Không giải quyết bằng tăng giới hạn tùy ý nếu chưa phân tích batch/queue.

## 14. Rủi ro kiểm thử

### R-019 — Test coverage hẹp

Tác động: High. Khả năng: High. Trạng thái: Open.

Test hiện có mạnh ở:

- syntax;
- regex contract cho queue/auth;
- một số loan/password/shareholder rules.

Thiếu hoặc hạn chế:

- unit test row mapping;
- formula preservation;
- full API registry contract;
- cache key parity backend/frontend;
- worker state transitions runtime;
- report fixture/snapshot;
- frontend interaction/integration;
- Google Sheets mock/integration;
- bound script tests;
- migration execution test.

Regex test có thể pass dù runtime behavior sai.

### Production smoke test risk

Smoke test RBAC cần credential production và có thể gửi request thật. Phải tránh destructive action hoặc dùng dữ liệu test được phê duyệt.

### Không có fixture báo cáo chuẩn

Thiếu golden dataset cố định làm việc refactor parser/cache báo cáo đặc biệt rủi ro. Đối soát thủ công Sheet vẫn là kiểm soát chính.

## 15. Rủi ro UX và nhận thức người dùng

### Pending vs synced

Người dùng có thể hiểu “đã tiếp nhận” là “đã ghi Sheet”. UI phải dùng ngôn ngữ/trạng thái rõ và chỉ báo thành công Sheet khi worker xác nhận.

### Dữ liệu khác nhau giữa reload

Optimistic row có thể biến mất/tái xuất khi cache sync. Đây có thể là trạng thái nhất quán cuối cùng chứ không phải mất dữ liệu; cần xem job status trước.

### Audit bị hiểu là tự sửa

Audit chỉ so sánh cache/live, không tự sửa dữ liệu. Nút audit nặng có thể mất thời gian; không chạy mặc định khi mở Cài đặt.

### Filter tháng

Các module dùng cả `MM/YYYY`, `YYYY-MM`, empty/latest và `Tất cả`. Normalize sai làm đọc nhầm bundle hoặc hiển thị tháng khác.

## 16. Rủi ro thay đổi năm dữ liệu

Cutover năm mới ảnh hưởng đồng thời:

- Script Properties Vận tải;
- resolver file Thu chi;
- frontend year hard-code;
- Supabase cache keys;
- report months;
- `IMPORTRANGE` source;
- danh mục hiệu lực;
- trigger cài trên file mới;
- bound script copy/project;
- PWA/frontend không đổi nhưng API context đổi.

Không chỉ copy file và đổi tên. Cần runbook/migration/cutover riêng.

## 17. Rủi ro từ dữ liệu người dùng trong Sheet

- Formula cộng tay trong cell số lít có thể bị value-normalization làm mất.
- Smart chip/typed column có thể từ chối set number format.
- Display value tiền/ngày Việt Nam có thể parse nhầm.
- Blank header/helper column có thể bị generic mapper bỏ hoặc ghi nhầm.
- Merged cells trong report không phù hợp CRUD table logic.
- ARRAYFORMULA làm `getLastRow()` lớn hơn dữ liệu thực.
- User sort/filter/delete trực tiếp làm row index thay đổi.
- Protection có thể khiến một phần batch ghi rồi lỗi nếu rollback không đủ.

## 18. Quy trình đánh giá rủi ro trước thay đổi

1. Xác định module và source of truth.
2. Xác định direct write hay queue.
3. Xác định cột công thức/helper/named range.
4. Xác định downstream report/công thức/cache.
5. Xác định role và đường bypass ngoài web.
6. Xác định timeout/quota/trigger.
7. Xác định idempotency và partial failure.
8. Xác định browser optimistic/cache state.
9. Xác định test hiện có và khoảng trống.
10. Xác định rollback/backup.
11. Đánh giá tác động/khả năng xảy ra.
12. Nếu Critical mà không có kiểm soát/test, dừng và xin phê duyệt kế hoạch riêng.

## 19. Quy trình cập nhật risk register

Thêm risk mới khi:

- phát hiện incident;
- thêm execution context/integration;
- thay source of truth;
- thêm queue/cache/action/role;
- phát hiện schema drift;
- test cho thấy failure mode mới.

Mỗi entry mới cần:

- ID ổn định;
- mô tả;
- tác động;
- khả năng;
- trạng thái;
- trigger/dấu hiệu;
- kiểm soát hiện có;
- owner hoặc tài liệu liên quan;
- cách phản ứng/rollback.

Không xóa risk lịch sử; chuyển trạng thái và ghi kiểm soát đã loại bỏ đường lỗi.

## 20. Checklist sau incident

- Dữ liệu Sheet có thực sự sai hay chỉ cache/UI sai?
- Write có xảy ra trước lỗi không?
- Có duplicate/partial write không?
- Công thức/helper còn nguyên không?
- Job status/log nói gì?
- Trigger/sync status gần nhất?
- Bound script/bot/direct Sheet có tham gia không?
- Role/secret có bị bypass/lộ không?
- Report tháng nào bị ảnh hưởng?
- Cache nào cần xóa/sync lại?
- Có cần restore backup không?
- Test nào cần bổ sung?
- Tài liệu/risk nào cần cập nhật?

## 21. Trạng thái tài liệu

- Loại tài liệu: risk register hiện trạng.
- Phạm vi: dữ liệu, báo cáo, cache, queue, Auth/RBAC, Apps Script, frontend, build, repository và bound script.
- Nguồn kiểm chứng: source repository, schema snapshots, migrations, tests và lịch sử sự cố trong `PROJECT_CONTEXT.md`.
- Ngày xác nhận gần nhất: 2026-07-11.
- Cần cập nhật khi: có incident mới, kiểm soát mới, thay kiến trúc/source of truth hoặc một risk thay đổi trạng thái.
