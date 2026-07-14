# C3 Parity Matrix

Trạng thái hợp lệ: `SOURCE_LOCKED`, `IMPLEMENTING`, `TECH_PASS`, `USER_APPROVED`, `BLOCKED`.

| Thứ tự | Surface | Golden states bắt buộc | Data/behavior gate | Trạng thái |
| --- | --- | --- | --- | --- |
| 0 | Login/Auth | login, error, busy, sign-out | HttpOnly session, đúng copy/logo/font | TECH_PASS |
| 1 | Shell/Nav | desktop sidebar, mobile drawer, bottom nav, active item, refresh, open Sheet | sáu destination, role visibility, không prefetch dữ liệu nặng | TECH_PASS |
| 2 | Dashboard | loading, 07/2026, đổi tháng, chart, latest trips, summary, export | `overview.kpis` + matrix + latest trips đúng semantics C2 | TECH_PASS |
| 3 | Report | 5 tab, latest/month/all, search, 4 matrix, empty/error, export | không tự tính lại report meaning | SOURCE_LOCKED |
| 4 | Manage | 6 sheet, quick/custom date, search, fuel filters/stats, pagination, edit/delete modal | row identity, RBAC, queue/direct contract hiện hữu | SOURCE_LOCKED |
| 5 | Entry | 6 form, multi-row, clone/add/remove, validation, pending/error | schema, idempotency, formula preservation | SOURCE_LOCKED |
| 6 | Catalog | 9 tab, personnel/owner filter, pagination, add/edit/delete modal | virtual mapping, effective-date/history semantics | SOURCE_LOCKED |
| 7 | Cashflow | overview, transactions, loans, catalog, filters, drawers, export | voucher/idempotency/reconciliation/native range | SOURCE_LOCKED |
| 8 | Settings | password, account admin, temporary password, role states | account actions và self-protection | SOURCE_LOCKED |
| 9 | Observability | sync status, queue, quick/deep/all/report audit, retry | heavy action chỉ khi chủ động; role gate | SOURCE_LOCKED |

## Role matrix

| Surface | Admin | Operator | Shareholder |
| --- | --- | --- | --- |
| Dashboard/Report/Cashflow read | Có | Có | Có |
| Manage read | Có | Có | Có |
| Entry/Manage write | Có | Có | Không |
| Catalog transport write | Có | Có | Không |
| Fund catalog/write | Có | Có | Không |
| Own password | Có | Có | Có |
| Account administration | Có | Không | Không |
| Observability/audit/retry | Có | Theo contract hiện hữu | Không |

## Approval log

Chỉ ghi `USER_APPROVED` khi người dùng đã kiểm tra preview tương ứng. HTTP 200, unit test hoặc source regex không thay thế visual approval.

- 2026-07-14: Login/Shell/Dashboard đạt technical gate trên deployment `dpl_5TcZ77CxZskFizUUNCZnT9rrG3hp`; 267/267 test, lint, typecheck, build và diff check đạt. Root preview trả HTTP 200 qua deployment-authenticated smoke. Chưa có authenticated visual approval của người dùng nên chưa surface nào được đánh dấu `USER_APPROVED`.
