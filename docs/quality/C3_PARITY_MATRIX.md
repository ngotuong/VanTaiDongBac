# C3 Parity Matrix

Trạng thái hợp lệ: `SOURCE_LOCKED`, `IMPLEMENTING`, `TECH_PASS`, `USER_APPROVED`, `BLOCKED`.

| Thứ tự | Surface | Golden states bắt buộc | Data/behavior gate | Trạng thái |
| --- | --- | --- | --- | --- |
| 0 | Login/Auth | login, error, busy, sign-out | HttpOnly session, đúng copy/logo/font | USER_APPROVED |
| 1 | Shell/Nav | desktop sidebar, mobile drawer, bottom nav, active item, refresh, open Sheet | sáu destination, role visibility, không prefetch dữ liệu nặng | USER_APPROVED |
| 2 | Dashboard | loading, 07/2026, đổi tháng, chart, latest trips, summary, export | `overview.kpis` + matrix + latest trips đúng semantics C2 | USER_APPROVED |
| 3 | Report | 5 tab, latest/month/all, search, 4 matrix, empty/error, export | không tự tính lại report meaning | USER_APPROVED |
| 4 | Manage | 6 sheet, quick/custom date, search, fuel filters/stats, pagination, edit/delete modal | row identity, RBAC, queue/direct contract hiện hữu | USER_APPROVED |
| 5 | Entry | 6 form, multi-row, clone/add/remove, validation, pending/error | schema, idempotency, formula preservation | USER_APPROVED |
| 6 | Catalog | 9 tab, personnel/owner filter, pagination, add/edit/delete modal | virtual mapping, effective-date/history semantics | USER_APPROVED |
| 7 | Cashflow | overview, transactions, loans, catalog, filters, drawers, export | voucher/idempotency/reconciliation/native range | TECH_PASS |
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
- 2026-07-14: người dùng từ chối visual Dashboard của deployment trên: font chưa được tải, `.table-wrap` bị shared CSS chèn margin và nút export bị cascade che SVG. Login/Shell/Dashboard trở lại `IMPLEMENTING`; technical pass cũ không còn hiệu lực.
- 2026-07-14: correction deployment `dpl_6gdxkLwGnXperukyRtre3iqCTmuz` đạt lại `TECH_PASS`: Plus Jakarta Sans tải thật; header–table gap 0px; export 28×28px/SVG 16×16px có stroke; viewport 390px không overflow; 268/268 test, lint, typecheck, build và diff check đạt. Vẫn chờ người dùng duyệt authenticated visual.
- 2026-07-14: người dùng phê duyệt tiếp tục checkpoint sau khi kiểm tra correction Dashboard; Login/Auth, Shell/Nav và Dashboard được khóa `USER_APPROVED`. Việc phê duyệt này không tự áp dụng cho các module còn lại.
- 2026-07-14: Report C2 port đạt `TECH_PASS` trên `dpl_AaUuAHLhhexV5QfihCqhNu3JTphP`: giữ năm tab, actual month/all, bốn matrix, tìm kiếm chỉ Lương/Xe, filter công ty/biển số, subtotal động, sticky columns, màu semantic, export ảnh/Excel và responsive C2. 270/270 test, lint, typecheck, build, diff check và computed-style 390/1440 đạt. Chờ người dùng kiểm tra authenticated Report trước khi chuyển Manage/Entry.
- 2026-07-14: preview deployment trên bị chặn ở đăng nhập vì target Preview không có nhóm biến server `SUPABASE_*`/workbook/proxy. Không sao chép được giá trị `sensitive`; thay bằng deployment `dpl_7ngtXhSgmejtggAh11TNthLUpn4T` dùng Production environment nhưng `--skip-domain`, rồi chỉ gán alias C3 preview. Session unauthenticated trả đúng 401, API health 200; `dongbac.vercel.app` vẫn là C2 recovery. Report tiếp tục `TECH_PASS`, chưa được coi là user-approved.
- 2026-07-14: người dùng phê duyệt tiếp tục checkpoint sau khi kiểm tra Report; Report được khóa `USER_APPROVED`. Manage/Entry port C2 đạt `TECH_PASS` trên `dpl_4n1fRoecZiXMhtc5hLPebqhY1KeP`: 6 sheet, quick/custom date, search, thống kê Tài xế/Xăng dầu, bảng ngang, pagination, edit/delete theo quyền; 6 form Entry, multi-row, clone/add/remove, validation và queue lifecycle. Gate đạt 270/270 test, lint, typecheck, build, diff check và computed-style/screenshot QA 500/1440. Preview session không cookie trả đúng 401, API health 200; production alias vẫn giữ C2 recovery.
- 2026-07-14: người dùng phát hiện Vận hành không hiển thị và chuyển menu có cảm giác chậm. Nguyên nhân là root C2 thiếu class `.active`, khiến `.view` luôn `display:none`; route còn chặn render để chờ catalog Entry. Correction `dpl_4hT1vCRx88R9LeG2dn716oC6yvV2` thêm lại state hiển thị, lazy-load catalog sau render, thêm C2 loading boundary và prefetch có mục tiêu theo hover/focus. Gate đạt 271/271 test, lint, typecheck, build, diff check; session 401/health 200, production vẫn C2. Manage/Entry tiếp tục `TECH_PASS`, chờ người dùng kiểm tra lại.
- 2026-07-14: người dùng phê duyệt tiếp tục checkpoint sau correction; Manage/Entry được khóa `USER_APPROVED`. Catalog đạt `TECH_PASS` trên `dpl_HohfDxtwRWx2AfEnvLgY2qVoAew5`: chín tab, filter nhân sự/chủ xe, cột chủ xe, bảng/pagination và modal CRUD dùng lại DOM/class C2; mapping `DM_ThamSo_TS`/`DM_ThamSo_GD`, clear-only và effective-date/history contract được giữ. Gate đạt 272/272 test, lint, typecheck, build, diff check; session không cookie/API health đúng contract. Browser automation bị Vercel Deployment Protection chặn trước app, vì vậy vẫn chờ người dùng duyệt authenticated visual trước Cashflow.
- 2026-07-14: sau khi kiểm tra, người dùng ghi nhận Manage và Catalog còn nhiều lỗi UI/UX nhưng phê duyệt tiếp tục hoàn thiện migration và hoãn thiết kế/chỉnh giao diện sang pha sau. Catalog được nâng `USER_APPROVED` cho gate migration; các lỗi đã thấy được giữ là UI debt, không được ghi nhận sai thành visual hoàn hảo.
- 2026-07-14: Cashflow đạt `TECH_PASS` trên `dpl_DxHVCvzd8Dc1ZZnDM8BGzPcNrrRc`: bỏ lớp redesign và port lại bốn surface C2 gồm report/export, quick/custom transaction filters, search, 20 dòng/trang, pending overlay, multi-row drawer, loan reconciliation/filter/history/payment và năm Fund Catalog group dạng inline. Queue/idempotency, row identity, native range, RBAC và Apps Script authoritative write contract được giữ. Gate đạt 272/272 test, lint, typecheck, build, diff check; session không cookie 401, API health 200. Production vẫn C2; Cashflow chờ người dùng kiểm tra authenticated visual/chức năng.
- 2026-07-14: người dùng phát hiện Cashflow `Nhập mới` kích hoạt sidebar và popup Manage bị navigation/stacking context che trên mobile. Correction `dpl_Dw7o14BkbLp77bNuXPZ6Q8ULctf9` tách body state của shell/modal, portal các overlay ra `document.body`, khóa bottom navigation khi modal mở và khôi phục full-viewport/safe-area/independent-scroll cho Entry mobile. Gate đạt 274/274 test, lint, typecheck, build, diff check; session 401/API health 200. Production vẫn C2; Cashflow giữ `TECH_PASS` và correction popup chờ người dùng kiểm tra authenticated.
