# Quy tắc làm việc cho Codex

Đây là Apps Script Web App độc lập, nằm trong My projects tại script.google.com.

Web app này không gắn cố định với một Google Sheet cụ thể.

Hệ thống có 2 module nghiệp vụ chính:

1. Module Vận tải
- Dữ liệu nằm trong Google Sheet vận tải theo từng năm.
- Mỗi năm có thể có một file vận tải riêng.

2. Module Thu chi
- Dữ liệu nằm trong Google Sheet thu chi theo từng năm.
- Module Thu chi cần được đưa vào web app như một menu riêng.
- Không hiểu Thu chi chỉ là nguồn import dữ liệu cho Vận tải.
- Một số liên kết dữ liệu giữa Thu chi và Vận tải đã được xử lý bằng công thức trong Google Sheet.

Quy tắc quan trọng:
- Không tự ý đổi tên sheet.
- Không tự ý đổi thứ tự cột.
- Không xóa công thức trong Google Sheet.
- Không gộp dữ liệu 2 file Google Sheet nếu chưa được yêu cầu.
- Không copy code web app vào từng Google Sheet theo năm.
- Không giả định SpreadsheetApp.getActiveSpreadsheet() là file dữ liệu chính.
- Khi không chắc chắn về yêu cầu, hỏi lại thay vì đoán
- Thay đổi lớn luôn lên kế hoạch và xem xét các vấn đề trước khi code
- Khi đọc/ghi dữ liệu chính, ưu tiên dùng SpreadsheetApp.openById(id).
- Nếu cần đổi cấu trúc Google Sheet, phải viết hàm migration riêng, không sửa trực tiếp.
- Trước khi sửa code phải giải thích kế hoạch ngắn bằng tiếng Việt.
- Sau khi sửa phải báo đã sửa file nào, sửa để làm gì, và cách test.

Tài liệu dự án:
- Khi bắt đầu cuộc trò chuyện mới hoặc sau khi mất ngữ cảnh, chỉ có hai file bắt buộc: `AGENTS.md` và toàn bộ `PROJECT_CONTEXT.md`.
- `PROJECT_CONTEXT.md` là current-state handoff duy nhất: dự án/module, kiến trúc hiện tại, checkpoint gần nhất, checkpoint tiếp theo, kiến trúc đích và rủi ro/gate.
- `docs/ai/AI_START_HERE.md` là router tài liệu theo loại tác vụ; không phải nguồn trạng thái. Không cần đọc toàn bộ thư mục `docs/` trong mọi cuộc trò chuyện.
- `NEXTJS_MIGRATION_PLAN.md` là roadmap hữu hạn cho foundation, module migration, cutover và legacy removal; chỉ đọc khi tác vụ liên quan Next.js/roadmap.
- `TARGET_ARCHITECTURE.md` là kiến trúc đích dài hạn và cổng phê duyệt. Agent không được tự bắt đầu step kế tiếp nếu người dùng mới chỉ yêu cầu đọc hoặc báo trạng thái.
- `PROJECT_SCHEMA.md` là schema index ngắn, dẫn tới schema snapshot và contract chi tiết.
- `SUPABASE_SCHEMA.md`, `SUPABASE_SETUP.md`, `WORKFLOW.md`, `ROLLBACK.md` là tài liệu schema/vận hành Supabase, deploy và rollback; chỉ đọc khi tác vụ liên quan.
- `REFACTOR_PLAN.md` và `AUDIT_REPORT.md` là tài liệu lịch sử. Không dùng chúng để suy ra checkpoint hiện tại hoặc bước tiếp theo.
- Khi có quyết định kiến trúc hoặc trạng thái lộ trình mới, cập nhật `PROJECT_CONTEXT.md`.

Quy trình khởi động:
- Đọc `AGENTS.md` và `PROJECT_CONTEXT.md`, kiểm tra `git status --short`.
- Nếu người dùng chỉ yêu cầu đọc/báo trạng thái, báo đúng 6 nội dung trong `PROJECT_CONTEXT.md` rồi dừng.
- Chỉ đọc tài liệu chuyên biệt theo router trong `docs/ai/AI_START_HERE.md` khi tác vụ yêu cầu.
- Không sửa file, migration, deploy, commit hoặc push cho đến khi người dùng phê duyệt rõ checkpoint cụ thể.
