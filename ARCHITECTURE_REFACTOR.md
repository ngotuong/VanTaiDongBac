# Lộ trình tái cấu trúc Web App Vận Tải Đông Bắc

## Mục tiêu

Web app là Apps Script độc lập trong My Projects, dùng chung code cho nhiều file Google Sheet theo năm. Vì vậy code phải tách rõ:

- **Runtime chung**: router API, validation, cache, HTML shell, frontend client.
- **Cấu hình theo file/năm**: spreadsheet ID, sheet schema, các liên kết báo cáo.
- **Logic nghiệp vụ sheet**: đọc/ghi `NL_*`, `DM_*`, báo cáo `BC_*`, cache báo cáo.

## Trạng thái sau bước khởi động

- `AppConfig.gs` quản lý spreadsheet ID active.
- `Code.gs` không còn hard-code cấu hình sheet 2026 trong router.
- `SheetService.gs` vẫn giữ logic nghiệp vụ nhưng cache đã scoped theo spreadsheet ID để tránh lẫn dữ liệu giữa các năm.
- `index.html` chỉ còn HTML shell.
- `styles.html` chứa CSS.
- `client.html` chứa JavaScript frontend.

## Cấu hình spreadsheet theo năm

Có thể cấu hình trong Script Properties:

- `ACTIVE_SPREADSHEET_ID`: file mặc định hiện tại.
- `DEFAULT_SPREADSHEET_ID`: file mặc định dự phòng.
- `SPREADSHEET_ID_2026`, `SPREADSHEET_ID_2027`, ...: map theo năm.

Request API có thể override bằng:

- `?year=2026`
- `?spreadsheetId=<GOOGLE_SHEET_ID>`
- body JSON `{ "year": "2026" }`
- body JSON `{ "spreadsheetId": "<GOOGLE_SHEET_ID>" }`

Nếu không truyền gì, hệ thống vẫn dùng file 2026 hiện tại để giữ production ổn định.

## Các bước tiếp theo

1. Tách `SheetService.gs` thành các service nhỏ:
   - `SpreadsheetRepository.gs`
   - `CatalogService.gs`
   - `ReportService.gs`
   - `EntryService.gs`
   - `ManageService.gs`
2. Tách `client.html` thành các module frontend theo view:
   - dashboard
   - entry
   - reports
   - manage
   - catalog
   - api/cache utilities
3. Chuẩn bị frontend Vercel:
   - tạo `web/` hoặc `frontend/`
   - build CSS/JS riêng
   - dùng Apps Script chỉ làm JSON API
4. Giảm phụ thuộc vào sheet công thức động:
   - cache báo cáo theo tháng chủ động hơn
   - giảm thao tác ghi `BC_TongQuan!B1` khi lọc tháng
   - thêm endpoint dữ liệu đã chuẩn hóa phục vụ dashboard/report
