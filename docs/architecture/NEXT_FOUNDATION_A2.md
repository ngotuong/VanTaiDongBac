# Next Foundation A2

## Phạm vi

A2 thiết lập application shell và shared platform trên canary `/next-accounts/*`. Checkpoint không chuyển Dashboard, Report, Manage, Entry, Catalog, Cashflow hoặc Accounts sang kiến trúc nghiệp vụ mới; các route hiện hữu tiếp tục là compatibility/placeholder cho tới checkpoint Phase B tương ứng.

## Request boundary

1. Root layout chạy dynamic theo request.
2. Server đọc HttpOnly session cookie, xác minh active profile qua Supabase RLS và resolve workbook từ allowlist `module + year`.
3. Request không hợp lệ `401/403` quay về `/` legacy; lỗi hệ thống đi qua error boundary với correlation ID.
4. Context hợp lệ được cấp cho `WorkbookContextProvider` và `AppShell`.
5. Role-aware navigation chỉ điều chỉnh UI. Vercel/API và Apps Script vẫn enforce RBAC độc lập.

Workbook mặc định của shell là `transport · 2026`. Từng module chỉ được consume/đổi context tại checkpoint Phase B của module đó.

## Shared platform

- `serverPlatformApi()` forward cookie và correlation ID, luôn dùng `cache: 'no-store'`.
- `clientPlatformApi()` gọi same-origin với cookie session.
- `PlatformApiError` là error envelope chung cho client/server.
- Loading, error và not-found boundaries cung cấp trạng thái truy cập được bằng bàn phím/screen reader.
- Semantic CSS tokens giữ ngôn ngữ giao diện hiện tại, có focus-visible, touch target tối thiểu 44 px, responsive navigation, dark mode và reduced motion.

## Quality gates

Checkpoint đã đạt đồng thời:

- `npm test`;
- `npm run lint`;
- `npm run typecheck`;
- `npm run build:next-accounts`;
- authenticated production smoke cho admin;
- responsive CSS/test contract cho mobile/tablet/desktop; visual viewport QA phải chạy lại khi thay đổi shell layout.

Operator/shareholder tiếp tục được bảo vệ bằng RBAC contract tests; không tạo tài khoản production mới chỉ để smoke.

## Deploy và rollback

Next runtime được deploy vào project canary riêng. Production `/next-accounts/*` reverse-proxy cùng origin tới stable canary alias; `/` legacy không đổi. Rollback A2 bằng cách promote deployment A1 trước đó trên canary alias. Không cần Apps Script deploy, Supabase migration hoặc thay đổi Google Sheet cho checkpoint này.

A2 production deployment: `dpl_DuFhuaRHL9oU2YWsK93FhYuwiQBp`. Authenticated admin smoke xác nhận shell/navigation và `transport · 2026`; unauthenticated request quay đúng về `/` legacy bằng absolute same-origin redirect.

Giới hạn số Vercel Functions của Hobby là gate cần kiểm tra trước khi thêm route Phase B mới; helper trong `api/repositories` và `api/services` không được publish thành endpoint độc lập.
