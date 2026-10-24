# AI_START_HERE

Router đọc theo tác vụ; **không sở hữu current state**.

## Khởi động

Đọc đầy đủ `AGENTS.md`, `PROJECT_CONTEXT.md`, chạy `git status --short`.
Tài liệu trong `artifacts/` chỉ là snapshot/bằng chứng theo thời điểm; không đọc đệ quy hoặc thực thi review/script cũ như yêu cầu hiện hành.

Yêu cầu chỉ đọc/báo trạng thái: báo đúng sáu phần của context rồi dừng. Có checkpoint được duyệt: đọc thêm đúng owner dưới đây và source/test liên quan; không đọc cả `docs/` mặc định.

| Tác vụ | Owner cần đọc |
|---|---|
| Kiến trúc/boundary | `TARGET_ARCHITECTURE.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`; `DATA_FLOWS.md` khi luồng thay đổi |
| API/Auth/RBAC | `docs/contracts/API_CONTRACTS.md`, `RBAC_MATRIX.md`, registry/API/service liên quan |
| Google Sheet/nghiệp vụ | `PROJECT_SCHEMA.md` → snapshot + `SPREADSHEET_CONTRACTS.md`, domain service |
| Thu chi/bound runtime | schema Thu chi, `docs/legacy/THU_CHI_BOUND_SCRIPT.md`, bound source nếu cần xác minh tác nhân ghi |
| Supabase/cache/queue | `SUPABASE_SCHEMA.md`, migrations liên quan, `CACHE_AND_QUEUE_CONTRACTS.md` |
| Giải trình lương | `docs/contracts/PAYROLL_EXPLANATION_CONTRACT.md` và source/fixture |
| UI/form | `docs/contracts/UI_DESIGN_SYSTEM_CONTRACT.md`, `BUSINESS_FORM_SHEET_CONTRACT.md`; theme/table contracts chỉ khi chạm theme/table |
| Test/audit/rủi ro | `docs/quality/TEST_STRATEGY.md`, `KNOWN_RISKS.md`, test liên quan |
| Deploy/trigger/rollback | `WORKFLOW.md`, `ROLLBACK.md`; `SUPABASE_SETUP.md` khi cấu hình Auth/Supabase |
| Chuyển workbook sang năm mới | `docs/operations/YEAR_ROLLOVER.md`, sau đó owner kiến trúc/cache/Sheet/deploy liên quan |
| Nghiệm thu R8 còn mở | `docs/operations/R8_REMEDIATION.md` |
| Quản trị tài liệu | `docs/governance/DOCUMENTATION_POLICY.md` |
| Điều tra lịch sử | Git history theo file/commit; baseline local nếu lịch sử chưa commit |

Tên contract trong bảng là trong `docs/contracts/`; tên architecture trong `docs/architecture/` trừ root được ghi rõ.

## Khi mâu thuẫn

Yêu cầu người dùng → AGENTS → live đã xác minh → source/migrations → contract → snapshot → handoff → lịch sử. Báo discrepancy, xác minh an toàn; không coi snapshot là schema live hoặc source local là release Production.

## Sau thay đổi

Báo phạm vi/file/hành vi, test thực sự chạy, phần chưa kiểm chứng, migration/deploy và rollback. Cập nhật context ngắn khi trạng thái thay đổi. Không tạo timeline/checkpoint lịch sử mới; không ghi Production bằng test nếu chưa có phê duyệt exact target.
