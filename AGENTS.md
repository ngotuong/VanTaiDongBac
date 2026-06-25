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
- Khi đọc/ghi dữ liệu chính, ưu tiên dùng SpreadsheetApp.openById(id).
- Nếu cần đổi cấu trúc Google Sheet, phải viết hàm migration riêng, không sửa trực tiếp.
- Trước khi sửa code phải giải thích kế hoạch ngắn bằng tiếng Việt.
- Sau khi sửa phải báo đã sửa file nào, sửa để làm gì, và cách test.
