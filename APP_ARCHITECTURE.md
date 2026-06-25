# APP_ARCHITECTURE.md

## Mục tiêu hệ thống

Đây là web app quản lý vận tải và thu chi quỹ vận tải.

Code web app nằm trong một Apps Script project độc lập tại script.google.com, không gắn với một Google Sheet cụ thể.

Mỗi năm có thể có một bộ dữ liệu riêng:

- Google Sheet Vận tải năm YYYY
- Google Sheet Thu chi năm YYYY

Web app dùng chung code cho tất cả các năm.

## Module chính

### 1. Vận tải

Dùng để:
- Nhập liệu vận tải, xăng dầu, chấm công, phạt, nghỉ vận hành (có thể thêm, sửa, xóa các mục)
- Theo dõi số chuyến
- Theo dõi xe
- Theo dõi tài xế
- Xem báo cáo vận tải
- Xem báo cáo lương
- Xem báo cáo kinh doanh
Dữ liệu lấy từ Google Sheet Vận tải của năm đang chọn.

### 2. Thu chi

Dùng để:
- Nhập khoản thu
- Nhập khoản chi
- Nhập khoản vay
- Thanh toán khoản vay
- Theo dõi sổ quỹ
- Xem báo cáo thu chi
- Xem chi tiết từng hạng mục thu, chi
- Xem báo cáo khoản vay

Dữ liệu lấy từ Google Sheet Thu chi của năm đang chọn.

Thu chi là module riêng trong web app, không chỉ là nguồn dữ liệu phụ để import sang vận tải.

## Nguyên tắc kỹ thuật

- Không phụ thuộc vào một Google Sheet cố định.
- Không dùng SpreadsheetApp.getActiveSpreadsheet() cho dữ liệu nghiệp vụ chính nếu không có lý do rõ ràng.
- Nên mở file dữ liệu bằng SpreadsheetApp.openById(spreadsheetId).
- Các hàm đọc/ghi dữ liệu nên nhận year hoặc datasetKey.
- Cấu hình dataset theo năm nên đặt trong Config.gs hoặc file cấu hình riêng.
