# Lộ trình tái cấu trúc Web App Vận Tải Đông Bắc

## Mục tiêu

Web app là Apps Script độc lập trong My Projects, dùng chung code cho nhiều file Google Sheet theo năm. Vì vậy code phải tách rõ:

- **Runtime chung**: router API, validation, cache, HTML shell, frontend client.
- **Cấu hình theo file/năm**: spreadsheet ID, sheet schema, các liên kết báo cáo.
- **Logic nghiệp vụ sheet**: đọc/ghi `NL_*`, `DM_*`, báo cáo `BC_*`, cache báo cáo.

## Trạng thái sau bước khởi động

- `AppConfig.gs` quản lý spreadsheet ID active.
- `Code.gs` chỉ còn marker dự án.
- `Router.gs` chứa `doGet`, `doPost`, JSON response và render HTML.
- `PublicApi.gs` chứa các hàm wrapper để gọi thủ công/tương thích Apps Script.
- `SheetService.gs` vẫn giữ logic nghiệp vụ nhưng cache đã scoped theo spreadsheet ID để tránh lẫn dữ liệu giữa các năm.
- Link báo cáo lấy `gid` động từ sheet đang active, không hard-code `gid` của file 2026.
- `index.html` là bản self-contained để Vercel/static hosting chạy trực tiếp.
- `styles.html` chỉ include các module CSS theo thứ tự cascade.
- `client.html` chỉ include các module JavaScript frontend theo thứ tự.
- Các file `styles_*.html` và `client_*.html` là source module để tiếp tục refactor; khi deploy static/Vercel cần đảm bảo `index.html` đã được inline từ các module này.

## Backend module map

- `AppConfig.gs`: runtime spreadsheet config, map theo năm và sheet schema.
- `Router.gs`: HTTP GET/POST router, response helpers, HTML template include.
- `PublicApi.gs`: Apps Script callable wrappers.
- `SheetService.gs`: nghiệp vụ đọc/ghi sheet, báo cáo, cache, quản lý dữ liệu.
- `ValidationService.gs`: chuẩn hóa và validate payload nhập liệu.

## CSS module map

- `styles_base.html`: design tokens, reset, base button/link styles.
- `styles_layout.html`: app shell, sidebar, topbar, panels, chart base, quick actions.
- `styles_dashboard.html`: KPI cards, dashboard chart, quick actions.
- `styles_entry.html`: entry shell, form tabs, autocomplete, status, form controls, submit bar.
- `styles_reports.html`: report tabs, report table cards, table base.
- `styles_settings_modal.html`: settings cards and CRUD modal.
- `styles_responsive.html`: bottom nav, icons, shimmer, loader, drawer, mobile quick access, responsive rules.

## Frontend module map

- `client_config.html`: cấu hình điều hướng, form schema, state global, helper autocomplete/date.
- `client_api.html`: backend URL, REST API, cache invalidation.
- `client_manage.html`: màn Quản lý nhật ký nhập liệu.
- `client_catalog.html`: màn Danh mục.
- `client_app.html`: boot app, navigation, export ảnh.
- `client_dashboard.html`: dashboard, KPI, biểu đồ, chuyến gần đây.
- `client_entry.html`: form nhập liệu và dòng nhập liệu.
- `client_reports.html`: báo cáo chi tiết, filter, subtotal, parse overview.
- `client_data.html`: data helpers, catalog/dashboard/report loaders, submit.
- `client_ui.html`: busy/status/drawer/settings và binding sự kiện cuối cùng.

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
