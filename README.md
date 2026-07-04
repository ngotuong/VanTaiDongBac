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
- `PROJECT_CONTEXT.md`: handoff/lộ trình sống để tiếp tục dự án giữa các cuộc trò chuyện.
- `PROJECT_SCHEMA.md`: bản đồ schema và kiến trúc chi tiết.
- `WORKFLOW.md`: quy trình sửa code, deploy, sync và rollback hằng ngày.

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

## Tiếp tục dự án với Codex

Khi mở cuộc trò chuyện mới, yêu cầu Codex đọc `AGENTS.md` và `PROJECT_CONTEXT.md` trước. Hai file này chứa quy tắc làm việc, trạng thái hiện tại và lộ trình tiếp theo.
