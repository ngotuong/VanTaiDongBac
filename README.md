# Vận Tải Đông Bắc Web App

Ứng dụng điều hành nội bộ dùng Next.js trên Vercel, kết nối Apps Script backend độc lập và các Google Sheet theo năm.

## Cấu trúc chính

- `AppConfig.gs`: cấu hình runtime, spreadsheet ID active, sheet schema.
- `Router.gs`: HTTP `doGet`/`doPost` và JSON API; không render giao diện.
- `PublicApi.gs`: wrapper functions để gọi thủ công trong Apps Script editor.
- `SheetService.gs`: nghiệp vụ đọc/ghi Google Sheet, báo cáo, cache.
- `ValidationService.gs`: validate và chuẩn hóa dữ liệu nhập liệu.
- `next-shell/`: App Router, module UI và API client/server boundary của frontend Next.js.
- `app/`: Vercel App Router entrypoint mỏng trỏ tới source trong `next-shell/`.
- `public/`: manifest và static assets của PWA Next.js.
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

Frontend:

```bash
npm test
npm run lint
npm run typecheck
npm run build
vercel deploy --prod
```

Apps Script API khi có thay đổi backend:

```bash
clasp push
clasp deploy --description "<description>"
```

Frontend legacy/HtmlService đã được xóa ở D1. Rollback presentation dùng deployment Vercel C2 đã lưu, không build lại `index.html` trong source hiện tại.

## Tiếp tục dự án với Codex

Khi mở cuộc trò chuyện mới, yêu cầu Codex đọc `AGENTS.md` và `PROJECT_CONTEXT.md` trước. Hai file này chứa quy tắc làm việc, trạng thái hiện tại và lộ trình tiếp theo.
