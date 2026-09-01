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
- `TARGET_ARCHITECTURE.md` là kiến trúc đích dài hạn và cổng phê duyệt. Agent không được tự bắt đầu step kế tiếp nếu người dùng mới chỉ yêu cầu đọc hoặc báo trạng thái.
- `PROJECT_SCHEMA.md` là schema index ngắn, dẫn tới schema snapshot và contract chi tiết.
- `SUPABASE_SCHEMA.md`, `SUPABASE_SETUP.md`, `WORKFLOW.md`, `ROLLBACK.md` là tài liệu schema/vận hành Supabase, deploy và rollback; chỉ đọc khi tác vụ liên quan.
- Roadmap/checkpoint đã hoàn tất không được giữ trong working tree như nguồn hướng dẫn sống; khi cần điều tra lịch sử, dùng `PROJECT_CONTEXT.md` và Git history.
- Khi có quyết định kiến trúc hoặc trạng thái lộ trình mới, cập nhật `PROJECT_CONTEXT.md`.

Quy trình khởi động:
- Đọc `AGENTS.md` và `PROJECT_CONTEXT.md`, kiểm tra `git status --short`.
- Nếu người dùng chỉ yêu cầu đọc/báo trạng thái, báo đúng 6 nội dung trong `PROJECT_CONTEXT.md` rồi dừng.
- Chỉ đọc tài liệu chuyên biệt theo router trong `docs/ai/AI_START_HERE.md` khi tác vụ yêu cầu.
- Không sửa file, migration, deploy, commit hoặc push cho đến khi người dùng phê duyệt rõ checkpoint cụ thể.

Quy tắc deploy Vercel Preview:
- URL preview ổn định duy nhất là `https://vantaidongbac-preview.vercel.app`.
- Chỉ chạy `npm run deploy:preview`; không chạy `vercel deploy`, `vercel alias set`, `vercel promote` hoặc tự tạo Shareable Link bằng tay.
- Script preview phải target đúng project ID `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`, dùng Production environment secrets với `--prod --skip-domain`, rồi chỉ gán alias `vantaidongbac-preview.vercel.app`.
- Tuyệt đối không đổi alias `dongbac.vercel.app`. Production chỉ được promote/rollback khi người dùng phê duyệt rõ trong một yêu cầu riêng.
- `vantaidongbac-c3-preview.vercel.app` là alias đã nghỉ, không được tái sử dụng.
- Sau deploy phải xác nhận: gate test/lint/typecheck/build/diff-check PASS; URL preview trả HTTP 200 và title `Vận tải Đông Bắc`; không chuyển tới `vercel.com/login`; deployment ID của `dongbac.vercel.app` trước/sau không đổi.
- Nếu script guard sai project ID, production alias thay đổi, preview còn Vercel Login hoặc thiếu environment, phải dừng và báo lỗi; không tự sửa bằng cách promote production.
