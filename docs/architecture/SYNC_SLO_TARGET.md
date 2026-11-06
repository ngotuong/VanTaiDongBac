# SYNC_SLO_TARGET

## 1. Quyết định kiến trúc

Mục tiêu người dùng thấy dữ liệu mới trong khoảng 1–2 phút **có thể đạt như một SLO thống kê**, nhưng không thể là bảo đảm tuyệt đối cho mọi lần sửa trực tiếp trong Google Sheets. Thời điểm Google chạy installable trigger, thời gian tính lại công thức/`IMPORTRANGE` và một native Google call đang chạy không nằm dưới quyền điều khiển của ứng dụng.

Vì vậy hệ thống không tiếp tục dùng `syncRealtimeCache()` và vòng housekeeping một phút làm đường SLA chính. Kiến trúc đích tách hai lane:

- **Foreground lane** chỉ xử lý generation dữ liệu cần xuất bản cho người dùng.
- **Background lane** tiếp tục xử lý catalog, lịch sử, audit, notification, full scan và safety polling.

Google Sheets vẫn là source of truth. Supabase chỉ giữ durable event/outbox, trạng thái điều phối và read model; không thay thế dữ liệu nghiệp vụ trong hai workbook.

## 2. Phạm vi SLO

### 2.1. SLO sản phẩm

Đối với edit hẹp thuộc tháng hiện hành, xác định được workbook/năm/module và không phải structural/full refresh:

- mục tiêu `p95 <= 90 giây` và `p99 <= 120 giây` từ lúc source commit được ghi nhận tới lúc Dashboard và báo cáo tháng đã publish nguyên tử;
- khi webapp đang mở và kết nối bình thường, invalidation metadata phải làm UI lấy bundle mới trong tối đa 15 giây sau publication;
- số đo đạt chỉ khi Dashboard và báo cáo cùng `source_data_version`, cùng generation và không chứa dữ liệu canary đã cleanup.

SLO được tính theo cửa sổ vận hành lăn 30 ngày và phải có đủ mẫu thật/copy-canary được phê duyệt. Một canary đơn lẻ chỉ là release gate, không chứng minh SLO dài hạn.

### 2.2. Tách các khoảng thời gian

Mỗi generation phải ghi được các mốc server-only sau:

1. `source_committed_at`: webapp xác nhận ghi Sheet xong, hoặc thời điểm installable trigger bắt đầu cho direct edit;
2. `event_persisted_at`: durable event đã ghi;
3. `dispatch_started_at`;
4. `worker_started_at`;
5. `source_ready_at`: công thức cần thiết đã ổn định;
6. `published_at`: Dashboard + report pair đã upsert thành công;
7. `client_observed_at`: telemetry metadata tùy chọn, không chứa số liệu nghiệp vụ.

Tách mốc để không gộp “Google chưa chạy trigger”, “công thức chưa sẵn sàng”, “worker chậm” và “browser chưa reload” thành một lỗi chung.

### 2.3. Phần không được tuyên bố là bảo đảm tuyệt đối

- độ trễ từ thao tác trong Google Sheets tới khi Google bắt đầu installable trigger;
- thời gian `IMPORTRANGE` hoặc công thức liên workbook hội tụ;
- outage/quota/hard timeout của Google, Supabase hoặc hạ tầng dispatcher;
- structural change, full backfill, sửa tháng lịch sử hàng loạt hoặc workbook đang migration;
- browser offline, tab bị hệ điều hành suspend hoặc client không còn session hợp lệ.

Các trường hợp này vẫn phải retry/fail closed và có telemetry; không được loại khỏi báo cáo lỗi. Chúng được phân loại riêng khỏi SLO edit hẹp để không che sự cố nền tảng hoặc đánh đồng với lỗi thiết kế của ứng dụng.

## 3. Kiến trúc hai lane

```text
Webapp write hoàn tất ─┐
                      ├─> durable sync generation/outbox ─> event ingress
Google onEdit/onChange ┘                                  │
                                                          v
                                          foreground dispatch / immediate invoke
                                                          │
                                                          v
                                             Apps Script foreground handler
                                                          │
                                      exact Sheets read + readiness/version check
                                                          │
                                                          v
                                atomic Dashboard + monthly report publication
                                                          │
                                                          v
                                      metadata invalidation -> UI revalidate

Minute trigger/safety poll ─> background lane: housekeeping, history, audit,
                              catalog, notification, reconciliation/backfill
```

### 3.1. Durable generation/outbox

Một event đại diện cho ý định đồng bộ, không chứa payload tài chính hoặc dữ liệu ô. Contract logic tối thiểu:

- `generation_id` và `event_key` bất biến để idempotency;
- `workbook_context_id`, `year`, `module`, `source_type`;
- scope đã chuẩn hóa: sheet/grid, tháng, structural/full flag;
- `source_committed_at`, `last_signal_at`, `not_before` để coalesce cửa sổ ngắn;
- lifecycle `pending -> dispatched -> claimed -> source_wait -> published | retryable | failed`;
- attempt, lease token/expiry, next attempt, error class và semantic build stamp;
- publication ACK cho cả Dashboard và report tháng.

Migration phải additive, RLS bật, browser không có quyền select/insert/update. Chỉ server/service role và RPC được grant hẹp mới được thao tác. Event mới cùng scope có thể nâng generation hiện tại trước khi claim; không được xóa event cũ trước durable ACK.

### 3.2. Event producer

- Sau write từ webapp, producer phát generation ngay sau exact Sheet commit; không chờ installable trigger.
- Installable `onEdit`/`onChange` phải xác thực owner/workbook, xác định scope và ghi durable event trước. Producer có thể gọi ngay foreground handler hẹp trong cùng trusted execution nếu provider strategy đã qua gate; không chạy housekeeping hoặc full refresh.
- Thay đổi Thu chi liên quan báo cáo Vận tải tạo scope dẫn xuất riêng. Worker chỉ publish khi readiness probe chứng minh công thức liên workbook đã phản ánh source version; chưa sẵn sàng thì retry có backoff, không publish snapshot cũ.
- Nếu fast path/đánh thức ingress thất bại nhưng event đã bền, reconciler sẽ dispatch lại. Nếu event chưa ghi bền thì trigger báo lỗi; không được ACK giả.

### 3.3. Foreground dispatch strategy

Dispatcher không phụ thuộc tick housekeeping một phút và chỉ làm orchestration:

1. nhận `generation_id` đã bền;
2. coalesce quiet window ngắn theo `last_signal_at`;
3. claim task idempotent theo generation;
4. gọi foreground handler ngay từ trusted producer hoặc qua external task provider;
5. retry theo lease và error class qua durable reconciler;
6. không đọc hoặc ghi dữ liệu nghiệp vụ trong Google Sheets.

Contract generation/lease/publication không phụ thuộc provider. Google Cloud Tasks + Cloud Run chỉ là lựa chọn khi tài khoản có billing và machine identity phù hợp; không phải điều kiện bắt buộc của kiến trúc. D1B đã xác minh **producer-driven direct foreground** khả thi trong môi trường không billing: webapp write và installable trigger persist event rồi gọi cùng một Apps Script foreground handler hẹp; Supabase outbox + minute reconciler chỉ retry event bị bỏ lỡ. Đây là provider strategy cho D2–D5, nhưng kết quả cô lập chưa phải nghiệm thu SLO end-to-end; không được gọi HTTP self-endpoint công khai hoặc dùng body secret như đường Production.

### 3.4. Foreground worker/handler

Foreground handler chỉ được phép:

- claim đúng một generation/lease;
- mở workbook bằng ID từ registry, không dùng active spreadsheet;
- force-read đúng source scope và kiểm readiness;
- chốt `source_data_version` trước khi dựng pair;
- dựng Dashboard và report tháng từ cùng version;
- kiểm tra version sau khi dựng;
- upsert hai `report_bundles` trong một batch nguyên tử logic;
- ACK generation chỉ sau khi cả hai cache key đã publish;
- ghi timeline metadata best-effort mà không thay ACK nghiệp vụ.

Handler không chạy catalog, manage history, notification, audit, payroll backfill hoặc full refresh. Nó phải trả kết quả phân loại `published`, `not_ready`, `retryable`, `terminal` để dispatcher/reconciler quyết định retry; response transport mơ hồ không được coi là chưa publish nếu ACK đã tồn tại.

### 3.5. Background lane

`syncRealtimeCache()` và các trigger nền tiếp tục tồn tại trong giai đoạn chuyển đổi để:

- safety reconciliation cho generation bị bỏ sót;
- catalog/startup/history/manage data;
- notification, audit và full backfill;
- refresh structural hoặc tháng lịch sử không thuộc SLO foreground.

Background lane không được claim lease foreground hoặc ghi đè publication mới hơn. Khi foreground feature flag bị tắt, đường hiện hành vẫn là fallback vận hành, nhưng không được mô tả là đáp ứng SLO 120 giây.

## 4. Publication và UI invalidation

Dashboard và report tháng là một publication unit. Consumer chỉ chấp nhận pair khi cùng:

- `generation_id`;
- `source_data_version`;
- `synced_at`/`published_at`;
- workbook/year/cache transformation version.

Publication metadata mới được phát qua kênh invalidation không chứa payload nghiệp vụ. Client đang mở nhận metadata, xóa đúng cache key và gọi same-origin API để lấy bundle mới; không mở `report_bundles`, operational table hoặc service role cho browser. Poll định kỳ vẫn là safety net, không phải đường SLA chính.

## 5. Bảo mật và ranh giới tin cậy

- Event ingress chỉ nhận request có chữ ký ngắn hạn/HMAC hoặc machine identity; chống replay bằng timestamp, nonce và `event_key`.
- Cloud worker không nhận Spreadsheet ID từ browser. Nó resolve context từ server registry.
- Nếu dùng external Apps Script foreground endpoint, endpoint phải có secret riêng với public API người dùng, allowlist action cố định và kiểm tra generation trong durable store trước khi chạy. Producer-driven direct foreground không mở endpoint công khai.
- Logs/timeline chỉ ghi ID kỹ thuật, scope, timestamp, duration, version, status/error class; không ghi số tiền, nội dung giao dịch, giá trị ô, user ID, credential hoặc URL có token.
- Supabase operational tables tiếp tục server-only; migration mới phải test `anon`, `authenticated` và `service_role` trên database cô lập.

## 6. Idempotency, concurrency và failure handling

- `event_key` chống phát trùng; task name/generation ID chống dispatch trùng.
- Claim dùng atomic RPC và lease có owner token. Worker khác chỉ reclaim sau expiry.
- Publication retry kiểm tra ACK pair trước khi tính lại; không append hoặc sửa dữ liệu nguồn.
- Event tới trong lúc worker chạy tạo generation kế tiếp hoặc nâng dirty version; owner hiện tại không được ACK thay generation mới.
- Nếu source version đổi giữa build, không publish row nào và retry generation mới nhất.
- Nếu một native Google call timeout, task được retry; idempotency/ACK quyết định đã publish hay chưa.
- Reconciler chỉ khôi phục task bị bỏ sót. Nó không clear queue/lease/cursor mù và không sửa Google Sheet.

## 7. Gate nghiệm thu

Một candidate chỉ được đề xuất Production khi đạt đủ:

1. Unit/contract test generation lifecycle, duplicate delivery, lease expiry, source đổi giữa build và atomic pair.
2. SQL test migration/RLS/RPC/concurrency trên database disposable.
3. Copy-canary riêng kiểm direct edit, webapp write, ba nguồn Vận tải, delayed formula, timeout/retry và exact cleanup.
4. Shadow Preview chứng minh event/dispatcher/worker timeline mà không publish hoặc chạm Production.
5. So sánh payload shadow với đường hiện hành theo cùng source version.
6. Tối thiểu 30 mẫu copy-canary hợp lệ đạt `p95 <= 90 giây`, `p99 <= 120 giây`; không dùng polling minute làm đường pass.
7. Một Production canary được phê duyệt riêng, exact-cell cleanup và rollback feature flag sẵn sàng.
8. Full gate test/SQL/lint/typecheck/build/audit/diff-check PASS; Production Vercel alias/deployment không đổi nếu checkpoint không phê duyệt frontend.

Không lặp canary Production để “thử may”. Candidate fail một gate phải quay lại đúng boundary gây lỗi hoặc dừng.

## 8. Lộ trình chuyển đổi có rollback

### D0 — Thiết kế kiến trúc

Chốt tài liệu này, SLO, boundary, acceptance và rollback. Không migration, runtime hay deploy.

### D1 — Validation spike cô lập

Xác minh provider candidate bằng project/workbook/database thử nghiệm:

- provider có thể dispatch, authenticate và retry task;
- idempotency/timeout/cost/quota phù hợp;
- Apps Script foreground endpoint tối thiểu có thể trả timeline trong budget;
- ownership và cleanup được ghi rõ.

D1 không dùng workbook hoặc deployment Production, không chứa số liệu thật và phải dọn tài nguyên thử nghiệm sau khi kết thúc. Kết quả là quyết định `GO`, `CHANGE_PROVIDER` hoặc `STOP`; chưa được phép làm migration live.

### D1B — Validation producer-driven direct foreground

Khi external task provider không đạt gate, kiểm chứng bằng Apps Script project + spreadsheet thử nghiệm:

- installable edit trigger persist generation rồi gọi foreground handler hẹp trong cùng execution;
- nhiều edit gần nhau dùng claim/lease để không chạy trùng và generation cuối không bị ACK thay;
- failure sau durable event được reconciler giả lập claim lại;
- không public HTTP endpoint, không static/body secret và không billing;
- ghi timeline edit/claim/publish, cleanup toàn bộ project/spreadsheet/trigger sau phép thử.

D1B chỉ kết luận khả thi và budget của fast path. Nó không dùng source Production, không tạo migration live và không thay trigger/deployment hiện hành.

**Kết quả D1B ngày 06/11/2026: `GO` cho feasibility/budget cô lập.** Installable edit trigger đã persist generation trước, claim bằng lock/lease và chạy direct foreground trong cùng execution; reconciler phút reclaim failure chưa ACK. Mười mẫu direct-path đạt min `0,801 giây`, p50 `1,738 giây`, p95 `2,305 giây`, p99 `2,341 giây`, max `2,350 giây`; burst 6 edit publish đúng generation cuối sau `6,658 giây` dù có stale discard; failure injection được reconciler publish đúng sau `17,985 giây`. Không có public endpoint, static/body secret, billing, Supabase hoặc tài nguyên Production.

Boundary chuyển sang D2:

- `signalAt` của spike được ghi sau khi installable trigger đã bắt đầu, nên chưa chứng minh độ trễ từ source commit đến trigger start và chưa được dùng để tuyên bố SLO Production;
- burst chứng minh intermediate `e.value` có thể coalesce hoặc không khớp generation quan sát; producer chỉ persist scope, source version và generation, còn worker phải đọc canonical current source;
- account tạo trigger phải có quyền mở workbook bằng ID; D1B từng fail `openById` trước khi workbook thử được share đúng owner;
- D2 chỉ dual-write event shadow, chưa foreground publish, để kiểm RLS/RPC, scope/version, duplicate delivery và lease/reclaim trước Preview.

Cleanup D1B đã hoàn tất: trigger về 0, deployment versioned undeploy, Sheet/folder thử xóa, Apps Script project vào Thùng rác, quyền OAuth thu hồi và temp source local dọn sạch. Local gate PASS 971/971 tests, SQL migrations 001–021, lint, typecheck, build/Environment Identity Guard, production dependency audit 0 và diff-check.

### D2 — Schema và producer shadow

Thêm migration additive cho generation/outbox/RPC; producer dual-write event nhưng foreground publish vẫn tắt. So sánh event scope với queue hiện hành.

### D3 — Dispatcher + foreground worker Preview

Chạy end-to-end trên copy-canary, sau đó shadow read-only với Preview. Đường hiện hành vẫn publish; candidate chỉ đo và so sánh.

### D4 — Atomic publication + UI invalidation Preview

Bật publish cho Preview/copy-canary, xác minh pair, security, cache invalidation và performance sample.

### D5 — Production canary và rollout có kiểm soát

Bật theo feature flag cho một scope/thời gian đã duyệt. Giữ background fallback; theo dõi error budget rồi mới mở rộng. Rollback chỉ tắt ingress/dispatcher/foreground publication; migration additive và event history được giữ, không restore workbook hoặc rollback schema ngược.

Mỗi D2–D5 là checkpoint phê duyệt riêng sau khi D1B đã đóng `GO` cô lập. Hoàn thành D1B không cấp quyền tự động tạo migration, deploy hoặc ghi Production.

## 9. Tiêu chí dừng

Phải dừng hoặc đổi kiến trúc nếu spike/Preview cho thấy một trong các điều sau:

- Apps Script foreground native calls vẫn thường xuyên vượt budget dù đã bỏ scheduler/housekeeping;
- công thức Google Sheets không thể đưa ra readiness/version đáng tin cậy;
- machine identity/secret rotation không đạt yêu cầu;
- dispatcher không có durable retry/idempotency hoặc chi phí vận hành không chấp nhận được;
- 30 mẫu hợp lệ không đạt SLO.

Khi đó bước tiếp theo không phải thêm patch vào minute tick. Phương án kiến trúc kế tiếp là chuyển foreground computation sang worker dùng Google Sheets API/service account, vẫn đọc Google Sheets làm source of truth; việc đó là quyết định và migration riêng vì ảnh hưởng credential, formula parity và phạm vi code lớn hơn.

