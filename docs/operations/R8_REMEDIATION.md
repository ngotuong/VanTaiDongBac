# R8 — remediation và nghiệm thu

Runbook cho checkpoint đang mở. Phê duyệt, deployment/version và gate hiện tại chỉ thuộc [PROJECT_CONTEXT](../../PROJECT_CONTEXT.md). Thao tác deploy theo [WORKFLOW](../../WORKFLOW.md), phục hồi theo [ROLLBACK](../../ROLLBACK.md). Không mở checkpoint mới, merge/mainpush, migration hoặc tạo giao dịch giả; commit/push branch riêng chỉ trong phạm vi phê duyệt ghi ở context.

## Phạm vi và acceptance

| Nhóm | Tiêu chí |
|---|---|
| Khối lượng/tài chính | Sửa giữ blank/decimal precision; explicit volume finite >0 trước enqueue/write; legitimate zero trường khác giữ. Writer bảo tồn formula/helper/validation/neighbor; blank dùng capacity×trips đúng |
| Event/đồng bộ | Bốn UID đúng handler/workbook/event; onEdit/onChange không Sheet metadata/ScriptLock; duplicate onChange EDIT skip. Drain không mất late signal; structural/safety scope đủ8manage/13catalog/report/Fund |
| Worker/cache | Stage/cursor/lease ownership; tối đa30stage, lượt chính45s/hai module chung60s giữa stage, Transport dừng sau1report. Recent/tháng ưu tiên/dashboard trước lịch sử; edit mới chỉ replan checkpoint background/Fund capture, giữ đủ scope. Cache miss/discovery/crash retry; ACK sau đủ scope/verification, không clear queue |
| Probe/Fund | Input hash chỉ commit sau cache dưới owned lease. Fund capture200rows/page giữ date/rowIndex/tiền; mất chunk/hash hoặc stamp đổi phải restart. Transport sync/audit và catalog/startup sync bypass read cache60s/catalog6h; Fund forced sync bypass cache5phút; chunk UTF-8 <100KB |
| Payroll/queue/security | Report-v6 exact source version, mismatch giữ needs_review. Canonical intent/actor/workbook/year; drift→409; journal/idempotency và uncertain→reconciliation; service-only RPC/RLS; QA operator locked |
| Release | Full tests, isolated actual SQL001–018, lint/typecheck/build/identity/diff/runtime audit PASS; paired immutable/backend/HEAD/consumer exact, rollback READY; cache source/parity/ACK và execution mới; public/authenticated smoke trước mở ghi |
| UI/tài liệu | Blank/hủy/focus, desktop/mobile/light/dark/keyboard và role đại diện. Critical boundary giữ nguyên có thể dùng evidence role cũ với ngày/giới hạn rõ; fresh admin QA. Handoff ngắn, một owner; thiết bị thật/CI remote ghi phần còn mở |

Không sửa lịch sử tài chính để tạo matched, retry uncertain hàng loạt, tắt email hoặc nới stale threshold để che lỗi. Một native Google/UrlFetch call không có deadline cưỡng bức; phân biệt application error, hard timeout, Google platform error và client deadline.

Nghiệm thu độ trễ:đo từ edit thật đến đúng dòng/số liệu trên UI, tách danh sách/tháng/dashboard/Quỹ overview; mục tiêu1–2phút cho thay đổi tháng hiện hành khi Google đáp ứng bình thường. Test local dùng RPC giả lập không chứng minh SLA Production. Phải kiểm cả backlog hai module, month move/delete, delayed IMPORTRANGE/report-v6 parity, ACK full scope và execution mới; chưa có edit tự nhiên thì giữ gate chưa kiểm chứng, không tạo giao dịch giả.

## Bằng chứng

Trạng thái/checkpoint và thư mục evidence hiện hành do context sở hữu. Chỉ mở manifest, source snapshot và log được context/runbook dẫn tới cho câu hỏi cụ thể; không đọc toàn bộ artifact. Local test không thay evidence Production, thời điểm snapshot không là trạng thái live.

Bằng chứng nghiệm thu gồm: immutable/live readback và consumer UID; source/cache parity; report-v6 exact-version; jobs/journal; raw/consumed/full-scope ACK; restore guards/helper/watchdog; public/authenticated UI và execution. Sample dưới hold/owner pump không chứng minh human-edit SLA. UNKNOWN tách khỏi verified failure; role evidence cũ chỉ dùng khi critical boundary exact và ghi ngày/giới hạn rõ.

Lịch sử các cửa sổ đã đóng ở Git history hoặc baseline local ignored; không giữ review/approval cũ làm kế hoạch triển khai mới. [Router](../ai/AI_START_HERE.md) dẫn tới contract cần đọc.

## Kết thúc cửa sổ đã duyệt

Trạng thái/phê duyệt và baseline rollback do context sở hữu. Preflight identity/live versions/triggers/jobs/queue; maintenance +pause/drain và backup mới. Giữ live manifest, bốn UID và sáu consumer. Nghiệm thu cache nguồn/tháng/report-v6/full ACK, execution và edit thật; owner pump không chứng minh độ trễ. Gate fail thì dùng quy trình rollback dưới đây, không mở ghi sớm.

1. Snapshot exact queue/raw signal/triggers/source; maintenance, watchdog hold và pause/drain trước cutover. Giữ workbook/schema/business rows.
2. Ghép cặp backend Production/Preview/sharedHEAD và immutable; sáu consumer đúng handler/event/workbook/timer, health HEAD nguyên. Owner đăng ký bốn UID sau rebinding và trước resume kỹ thuật; không installer.
3. Quan sát actual stage, crash/retry/cursor, cache nguồn/phạm vi tháng, report-v6 exact, verification/ACK và tín hiệu raw/consumed. Đối soát jobs0active và không ghi lại giao dịch. Owner pump chỉ dùng cùng guarded worker, tối đa6lượt/150s giữa lượt, chờ lease tối đa20lần×1s; không force-clear.
4. Phục hồi Script guards exact, bỏ helper owner tạm, xác minh sharedHEAD exact immutable; watchdog ACTIVE. Guarded activate frontend chỉ khi local/public/pairedBackend/payrollVersionParity/browserRoles/queueReconciliation có evidence thật.
5. Hậu kiểm alias/identity/guard, root/title/manifest/sw200, anonymous401, authenticated data/blank form; Preview alias/guard giữ nguyên, rollback READY. Quan sát execution mới, xóa credential tạm, cập nhật context và ghi hạn chế. Không hứa hết Google/email failures vĩnh viễn từ cửa sổ ngắn.

## Rollback

1. Production maintenance qua guarded `npm run deploy:production -- --phase=rollback --expected-production=<live-id> --record=<reviewed-record>`; target phải là maintenance đã review, không nhầm backend hoặc R7.
2. Hold watchdog, pause/drain consumer, lưu snapshot mới exact queue/lease/raw signal và source. Enqueue đủ scope cho signal chưa consumed; đối soát uncertain job/journal/marker/row trước retry.
3. Immediate backend phục hồi theo context. Khi source xác minh planner/task/property schema tương thích, giữ nguyên scope/cursor, không chạy adapter legacy. Chỉ downgrade về runtime legacy cần owner-only `ManualReportRefreshQueueService.prepareLegacyRollback` cho **cả Transport/Fund**:dry-run rồi apply exact snapshots với paused guard/durable backup; không apply khi lease active. Với `targetRuntime:'staged401'`, bỏ task/probe/capture mới và giữ full/manage/catalog scope để runtime lập lại plan.
4. Phục hồi canonical Production/Preview/sharedHEAD exact immutable/source/manifest và consumer scopes; đăng ký binding nếu runtime dùng UID. Giữ migrations001–018/journal/ledger/history, không restore toàn workbook. Refresh/verification/parity, restore guards/watchdog và smoke trước mở ghi.
5. Về399 phải theo owner [ROLLBACK](../../ROLLBACK.md):adapter legacy khác staged401, manage/catalog cần plan riêng; không dùng398 vì lỗi checkbox. Full R7/backend394 là phương án khác. Schema rollback bằng forward correction.

## Còn mở

Độ trễ natural human-edit và subcall nguồn chậm chưa nghiệm thu theo context. Thiết bị thật iPhone/Safari/iOS push/Home Screen/reduced-motion còn mở. Git branch/draftPR và CI remote đã PASS đúng source được duyệt; không tự merge/mainpush. Payroll nguồn tháng5–8 và lịch sử volume giữ trạng thái/giới hạn trong context. Không yêu cầu bịa giao dịch để nghiệm thu. Runbook chưa đạt đủ acceptance phải giữ trạng thái chưa hoàn tất.
