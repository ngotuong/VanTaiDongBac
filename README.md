# Vận Tải Đông Bắc Web App

Apps Script web app độc lập dùng chung cho các Google Sheet theo năm.

## Cấu trúc chính

- `AppConfig.gs`: cấu hình runtime, spreadsheet ID active, sheet schema.
- `Router.gs`: HTTP `doGet`/`doPost`, JSON response, render HTML.
- `PublicApi.gs`: wrapper functions để gọi thủ công trong Apps Script editor.
- `SheetService.gs`: nghiệp vụ đọc/ghi Google Sheet, báo cáo, cache.
- `ValidationService.gs`: validate và chuẩn hóa dữ liệu nhập liệu.
- `index.html`: bản self-contained để Vercel/static hosting chạy trực tiếp.
- `styles.html`: include các CSS module.
- `client.html`: include các frontend JS module.
- `ARCHITECTURE_REFACTOR.md`: lộ trình refactor và module map chi tiết.

## Cấu hình file Google Sheet theo năm

Script Properties hỗ trợ:

- `ACTIVE_SPREADSHEET_ID`
- `DEFAULT_SPREADSHEET_ID`
- `SPREADSHEET_ID_2026`, `SPREADSHEET_ID_2027`, ...

API cũng có thể nhận `year`, `spreadsheetId`, hoặc `ssId` để override file đang active.

## Deploy

```bash
clasp push -f
clasp deploy --deploymentId AKfycbzTp7g9JdYsP4x1kgL5iymJc67Sq7q1qjjLP-bPH2MBBitrAt-xv2W0qJSR9b6di6KAUA --description "<description>"
```

Lưu ý: vì Vercel đang phục vụ repo như static site, `index.html` không được để lại Apps Script template tag `<?!= include(...) ?>`.
