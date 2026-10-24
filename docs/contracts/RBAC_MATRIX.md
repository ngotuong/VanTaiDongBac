# RBAC_MATRIX

Contract phân quyền; current deployment/checkpoint và kết quả live do [context](../../PROJECT_CONTEXT.md) sở hữu. Đối chiếu source 2026-10-04. Không cấp thêm quyền bằng tài liệu này.

## 1. Danh tính và session

- Role hợp lệ: `admin`, `operator`, `shareholder`; Supabase Auth + row `app_users` active khớp `user_id` mới được vào app. `BOT_USERS` Thu chi không thay allowlist này.
- Username normalize lowercase, 3–40 ký tự `a-z0-9._-`, unique qua `lower(username)`; email kỹ thuật `<username>@dongbac.internal`.
- Password tối thiểu 6 ký tự; đổi cá nhân yêu cầu password hiện tại và password mới khác cũ. Không log/commit/lưu password thô; password tạm chỉ hiện trong response quản trị, chuyển qua kênh riêng.
- Next giữ access/refresh token trong cookie HttpOnly/SameSite=Strict; browser JS không đọc token. Client dùng same-origin API; server tương thích Bearer khi có nhưng không đưa JWT vào browser để QA.
- Shell gọi `GET /api/session` khi mount, mỗi 40 phút và sau khoảng nghỉ; rotate khi access còn ≤25 phút. 401 thử refresh một lần rồi reload route; chỉ xóa cookie khi authentication/refresh thất bại. Lỗi mạng/5xx giữ cookie để retry.
- Proxy xác minh Supabase Auth và đọc active allowlist mỗi request. Đổi role/khóa có hiệu lực request tiếp theo; UI có thể cần reload. RLS own-profile: `user_id=auth.uid()` và active; không cấp browser update profile.

## 2. Ma trận màn hình

R = đọc; W = ghi nghiệp vụ; A = quản trị; — = không được cấp. Phân quyền ở server luôn bắt buộc dù UI ẩn nút.

| Khu vực | Admin | Operator | Shareholder |
|---|---|---|---|
| Tổng quan/Báo cáo/bảng lương cuối | R | R | R |
| Giải trình lương cá nhân | R | R | — |
| Nhập liệu/Vận hành | R/W | R/W | R qua Vận hành, không form ghi |
| Danh mục Vận tải/Thu chi | R/W | R/W | — |
| Tổng quan Quỹ/giao dịch/công nợ/khoản vay | R/W theo action | R/W theo action | R |
| Sync/queue/audit/retry/worker/cache invalidation | R/A | R/A | — |
| Đổi mật khẩu cá nhân | W | W | W |
| Quản lý tài khoản | A | — | — |

Operator hiện được audit/retry/worker như admin; không suy ra quyền hẹp hơn từ tên role. Muốn đổi phải sửa contract/policy có chủ đích.

## 3. Ma trận API

Owner method/envelope/side effects: [API contracts](API_CONTRACTS.md) và `ApiActionRegistry.gs`. Boundary: `api/app.js`, `server/services/authorization-policy.js`, account/payroll services.

| Nhóm action | Admin | Operator | Shareholder | Enforcement |
|---|---|---|---|---|
| `health` | R | R | R | GET public trong `/api/app`; không tạo session |
| `authSession`, `runtimeContext` | R | R | R | Session + active allowlist, workbook resolve server |
| `changeOwnPassword` | W | W | W | Own account, password hiện tại |
| `listUsers`, `createUser`, `updateUser`, `resetUserPassword` | A | — | — | `assertAdmin` |
| `getPayrollExplanation`, `requestPayrollExplanationRefresh` | R/refresh | R/refresh | — | Explicit admin/operator, shareholder deny |
| `getWriteJobStatus`, `getRecentWriteJobs`, sync/audit/retry/worker | R/A | R/A | — | Shareholder deny |
| `getBootstrap`, `getInitialData`, `readSheetData`, `readCatalogData`, `getFundCatalog` | R | R | — | Không trong shareholder allowlist |
| Transport/fund add/update/delete/catalog writes, `invalidateCaches` | W/A | W/A | — | Role check trước dispatch/queue; GET invalidation vẫn có side effect |

**Shareholder allowlist chính xác** (`SHAREHOLDER_ACTIONS`):

`authSession`, `runtimeContext`, `changeOwnPassword`, `getStartupData`, `getDashboard`, `getReports`, `getReport`, `getReportBundle`, `getCatalogs`, `readManageData`, `getFundTransactions`, `getFundOverview`, `getFundLoanOverview`, `getFundFormOptions`, `getNotifications`, `checkTripReconciliation`.

Action khác mặc định 403 với shareholder. Read API có thể cập nhật technical cache nhưng không được dùng để ghi nghiệp vụ. Chỉ cho role đọc catalog tối thiểu phục vụ render; không đồng nghĩa mở bảng danh mục quản trị.

- `BUSINESS_WRITES_PAUSED=true`: sau RBAC, trước dispatch, chặn POST (trừ read-only reconciliation) và GET invalidation bằng 503. Guard không thay RBAC, không dừng Apps Script triggers hoặc push/preferences endpoints.
- Account create: Auth user rồi profile; profile lỗi thì cố rollback Auth user. Admin không tự hạ role hoặc khóa chính mình. Khóa allowlist không tự xóa Auth user/session; revoke/delete riêng cần thao tác được duyệt.
- UI phải giữ bảng/filter/search/export được phép; ẩn toàn bộ entry point ghi, row/bulk/shortcut/drawer/retry với shareholder. Giải trình: không render cột/nút/dialog khi thiếu admin/operator; server vẫn trả 403 nếu gọi trực tiếp.

## 4. Supabase, Apps Script và Google Sheets

Schema/grants chi tiết: [SUPABASE_SCHEMA](../../SUPABASE_SCHEMA.md), migrations; không suy ra quyền live từ snapshot cũ.

| Resource | Browser `anon` | Active `authenticated` | `service_role` |
|---|---|---|---|
| Business cache được grant authenticated select | Không | Select qua RLS active membership | Read/write |
| `catalog_bundles`, `sync_status`, `write_jobs`, `write_job_logs` sau 015 | Không | Không | Read/write |
| Payroll v5/v6; push/notification operational tables server-only | Không | Không | Read/write theo schema |
| Claim/payroll replacement RPC | Không | Không | Execute |
| `write_job_logs_id_seq` sau 018 | Không | Không | Chỉ USAGE; không SELECT/UPDATE |

- RLS business cache kiểm tra active membership, chưa chia visibility theo app role. Người có JWT/key hợp lệ vẫn có thể gọi REST trực tiếp đến bảng được grant; không đặt secret/role-private payload trong cache rộng chỉ vì UI ẩn menu. Next hiện đọc qua server boundary, không dùng mô hình browser giữ JWT lịch sử.
- Browser không có quyền ghi cache/queue/profile. Service-role, proxy secret và VAPID private key chỉ ở server/Script Properties; không prefix `VITE_`/`NEXT_PUBLIC_`, không log/export vào artifact.
- `SecurityService.assertProxyRequest()` bắt shared secret khi `AUTH_ENFORCEMENT_ENABLED=true`; false giảm bảo vệ direct HTTP. Apps Script tin proxy đã enforce role, không tự xác minh JWT/app_users. Không thêm đường có secret nhưng bỏ role check.
- Apps Script root API-only, không HtmlService UI. Editor/global functions, trigger owner và `clasp run` chạy ngoài web RBAC; kiểm soát quyền Google project riêng.
- Google Drive sharing/protected ranges/bound script/direct edit nằm ngoài web RBAC. Shareholder trên web không tự trở thành viewer trong Sheet; không đổi formula/schema để thử quyền.

## 5. Thông báo và Web Push

- Mọi active role được self-service đăng ký/hủy/test thiết bị và preferences của chính mình qua `/api/push`; không cấp quyền gửi tới người khác. Repository scope `user_id` + SHA endpoint; mutation kiểm origin/host và `X-VTDB-CSRF: session`.
- Fund-alert dry-run/config chỉ admin; recipient rule số dư Quỹ là admin/shareholder active có thiết bị, không operator. Cron sender dùng Bearer secret và server feature flag, không session người dùng; Preview không tự bật cron/delivery.
- Subscription/operational state server-only. Test notification không chứa tên tài xế/số tiền trên màn hình khóa; VAPID private không ra browser. Endpoint HTTPS allowlist/deadline theo [API contracts](API_CONTRACTS.md).

## 6. Thay quyền, kiểm thử và incident

- Role mới phải cập nhật DB constraint, account validation, policy, navigation/labels/guards, data visibility RLS, contract/tests và migration/rollback; deny-by-default. Không chỉ sửa dropdown.
- Action mới phải xác định method, sensitive data và cả side effect GET/queue/trigger; review admin-only, operator need, shareholder allowlist, actor server, RLS direct reads và UI. Action admin/operator không có restriction riêng không tự thành admin-only.
- Kiểm thử 401/403/success: unauthenticated, ngoài allowlist/inactive, admin/operator/shareholder; direct Apps Script thiếu secret và direct Supabase grants riêng. Cookie refresh lỗi/role đổi/self-lock guard phải được kiểm tra.
- Role QA dùng tài khoản hiện hữu, cả HTTP status/payload và UI desktop/mobile/keyboard. Render/unit/regex không thay session browser thực. `tests/r8-payroll-role-render.test.js` render component thực; `tests/payroll-explanation-api.test.js` kiểm API service.
- Không chạy `tests/production-rbac-smoke.js` mặc định: script tạo/reset user. Ghi dữ liệu test/create user/destructive cleanup chỉ trong exact scope/target được phê duyệt; không log credentials hoặc lấy token/cookie để thay QA.
- Nghi lộ proxy secret: rotate hai phía Vercel/Apps Script, triển khai ghép cặp và kiểm direct request bị chặn. Nghi lộ service key: revoke/rotate Supabase, cập nhật cả server/Apps Script, kiểm DB/Auth logs; không gửi key cũ vào issue.
- User cần khóa: active=false, xác minh proxy/RLS deny, xử lý Auth sessions riêng nếu được duyệt và kiểm Drive sharing. Rollback theo [ROLLBACK](../../ROLLBACK.md); không tự tắt enforcement để chữa Auth lỗi.

Quy trình/gates đang mở: [R8 runbook](../operations/R8_REMEDIATION.md). Lịch sử chi tiết dùng Git history hoặc baseline recoverable; không dùng Bearer/legacy helper descriptions làm current state.
