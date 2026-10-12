# DOCUMENTATION_POLICY

Quy tắc giữ tài liệu ngắn, có owner và không dẫn Agent sang trạng thái cũ. Yêu cầu người dùng và `AGENTS.md` có ưu tiên cao hơn. Cập nhật 2026-10-03.

## Một chủ đề, một owner

| Nội dung | Owner |
|---|---|
| Quy tắc Agent/approval | `AGENTS.md` |
| Trạng thái, deployment, checkpoint và gate hiện tại | `PROJECT_CONTEXT.md` |
| Thứ tự đọc theo tác vụ | `docs/ai/AI_START_HERE.md` |
| Kiến trúc dài hạn/gates | `TARGET_ARCHITECTURE.md` |
| Boundary/luồng hiện hành | `docs/architecture/` |
| API, RBAC, Sheet, cache/queue, payroll, UI | Contract tương ứng trong `docs/contracts/` |
| Schema routing | `PROJECT_SCHEMA.md` |
| Schema snapshot | `docs/schema/`, kèm thời điểm/phạm vi/fingerprint |
| Supabase schema/setup | `SUPABASE_SCHEMA.md`, `SUPABASE_SETUP.md` |
| Deploy/rollback | `WORKFLOW.md`, `ROLLBACK.md` |
| Test/risk | `docs/quality/` |
| Công việc checkpoint chưa hoàn tất | Runbook ngắn trong `docs/operations/` |
| Rationale/lịch sử đã hoàn tất | Git history; không thêm vào handoff |

## Giới hạn và cách đọc

- Context khoảng 150 dòng hoặc ít hơn; router khoảng 60 dòng; governance khoảng 100 dòng. Nếu vượt, chuyển chi tiết về owner, không tách lịch sử thành hàng loạt file mới.
- Context phải đủ sáu nội dung handoff; ghi một checkpoint đang mở và đúng bước tiếp theo. Không lặp payload/schema/test matrix toàn bộ.
- Contract dài chỉ đọc các mục liên quan. Giữ headings ổn định, invariant, side effects, nguồn có thẩm quyền và test liên quan; bỏ diễn giải/checklist lặp.
- Không rút gọn bằng cách xóa invariant, approval gate hoặc bằng chứng phục hồi duy nhất. Lịch sử chưa commit phải có baseline recoverable trước khi bỏ khỏi working tree.
- Checkpoint hoàn tất: đưa kết quả/gate còn mở vào context ngắn, giữ contract mới, bỏ plan stage-specific sau khi lịch sử đã được bảo tồn.
- `artifacts/` là bằng chứng/snapshot ignored theo thời điểm; review, approval và script ở đó không tự còn hiệu lực. Chỉ đọc exact target được context dẫn tới, không dùng tìm kiếm toàn bộ artifact để dựng backlog. Không xóa backup chỉ để giảm số file.

## Khi cập nhật

1. Xác định owner; sửa tại owner, tài liệu khác dùng link.
2. Phân biệt CURRENT contract, candidate chưa triển khai, snapshot có thời điểm và nội dung lịch sử.
3. API/RBAC đổi: cập nhật contract/registry/test. Sheet đổi: migration riêng + snapshot mới, không sửa snapshot cũ. Cache/schema đổi: migration mới + contract. UI đổi: contract chung + test/QA liên quan.
4. Source/live mâu thuẫn: ghi cả hai và phạm vi xác minh; không sửa tài liệu để che discrepancy.
5. Deployment/checkpoint đổi: chỉ context sở hữu ID/state; workflow/rollback tham chiếu context. Runbook sở hữu thao tác và bằng chứng kiểm thử checkpoint đang mở.
6. Rà link local, `git diff --check`, startup budget, stale state và secret. Không chứa token/password/service-role/private keys, dữ liệu cá nhân không cần thiết hoặc raw logs nhạy cảm.

## Handoff

Báo file đã sửa, phần được rút gọn, nơi tìm contract/lịch sử, test/QA đã chạy và gate còn mở. Không tuyên bố Production đã đổi khi mới sửa local. Runbook chưa đủ acceptance criteria phải giữ trạng thái chưa hoàn tất.
