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

Preview frontend (lối duy nhất được phép):

```bash
npm run deploy:preview
```

Script này tự chạy test, lint, typecheck, build, identity/diff gate, deploy candidate và chỉ gán alias `vantaidongbac-preview.vercel.app`. Không chạy trực tiếp `vercel deploy`, `vercel alias set` hoặc `vercel promote`.

Production và Apps Script chỉ deploy khi có checkpoint/phê duyệt riêng. Quy trình chi tiết nằm trong `WORKFLOW.md`; rollback nằm trong `ROLLBACK.md`.

Apps Script source sync/deploy thủ công không phải thao tác khởi động mặc định:

```bash
clasp push
clasp version "<description>"
```

Sau đó phải update đúng deployment ID Preview hoặc Production đã được phê duyệt; không tạo deployment tùy ý.

Frontend legacy/HtmlService đã được xóa ở D1. Rollback presentation dùng deployment Vercel C2 đã lưu, không build lại `index.html` trong source hiện tại.

## Tiếp tục dự án với Codex

Khi mở cuộc trò chuyện mới, yêu cầu Codex đọc `AGENTS.md` và `PROJECT_CONTEXT.md` trước. Hai file này chứa quy tắc làm việc, trạng thái hiện tại và lộ trình tiếp theo.

`PROJECT_CONTEXT.md` cũng chứa timeline rút gọn toàn chương trình. Tài liệu audit/refactor/migration cũ chỉ dùng khi cần điều tra lịch sử.
