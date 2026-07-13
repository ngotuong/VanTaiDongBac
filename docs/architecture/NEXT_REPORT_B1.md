# Next Report B1

## Boundary

`/next-accounts/reports/` là Server Component route. Initial request resolve workbook `transport + year` ở server, gọi action `getReportBundle` hiện có bằng HttpOnly cookie và truyền bundle đã loại Sheet links sang Client Component.

Client Component chỉ sở hữu tab, search, month, refresh, loading/error và CSV. Đổi tháng/làm mới gọi `GET /next-accounts/report-data/`; route handler resolve workbook server-side rồi dùng shared API client. Browser không nhận hoặc tự chọn Spreadsheet ID.

## Data contract

UI render trực tiếp bốn matrix authoritative:

1. `overview.months`;
2. `overview.details`;
3. `payroll`;
4. `vehicles`.

B1 không tính lại KPI, payroll matching hoặc report meaning. Google Sheets vẫn là source of truth; Supabase `report_bundles` vẫn là cache và Apps Script vẫn là fallback.

## Interaction và accessibility

- tab có `tablist/tab/aria-selected`;
- loading dùng `role=status`, error dùng `role=alert` và có retry;
- filter có visible label, control tối thiểu 44 px;
- table region keyboard-focusable và có accessible horizontal-scroll label;
- empty state rõ, reduced motion và dark tokens kế thừa A2.

## Deploy và rollback

- Code commit: `79b4fab`.
- Canary deployment: `dpl_B8boZZ74JoVoYKqaXrCVLbsRLhja`.
- Rollback bằng promote deployment A2 `dpl_DuFhuaRHL9oU2YWsK93FhYuwiQBp`; `/` legacy không đổi.
- Không Apps Script deploy, Sheet/Supabase migration hoặc business write.

Trạng thái hiện tại là `IN PROGRESS`: data/auth/build gates đạt, visual responsive viewport gate đang chờ browser backend khả dụng.
