# NEXT FOUNDATION A1

## 1. Quyết định runtime

Next.js canary dùng Vercel Next.js runtime, không còn `output: 'export'`. Route động vẫn nằm dưới `basePath: /next-accounts`; `/` production legacy không đổi.

Hai deployment boundary được tách rõ trong giai đoạn foundation:

- `vercel.json`: deployment legacy hiện tại, output tĩnh tại repository root;
- `vercel.next.json`: deployment canary Next runtime; root `app/` re-export route source từ `next-shell/app/` để dùng Vercel adapter chuẩn.

Không dùng cấu hình Next runtime để deploy đè production legacy. Canary thuộc project `vantaidongbac-next-canary` và được reverse-proxy dưới cùng origin `/next-accounts/*`; cookie host-only không được chia sẻ bằng cách mở trực tiếp domain canary khác. Build legacy xóa artifact tĩnh `next-accounts/` trước khi deploy để filesystem không che rewrite. Rollback là promote deployment legacy trước A1 hoặc bỏ rewrite và phục hồi static artifact.

## 2. Cookie session và threat model

Browser vẫn đăng nhập bằng Supabase SDK. Sau khi Supabase trả session, frontend gửi session đúng một lần đến `POST /api/session` cùng header `X-VTDB-CSRF: session`.

Server kiểm tra same-origin và CSRF header, xác minh access token bằng Supabase Auth, kiểm tra `app_users` đang active, rồi mới đặt cookie. Cookie dùng `HttpOnly`, `SameSite=Strict`, `Secure` ở production và `Path=/`. Access cookie tối đa một giờ; refresh cookie tối đa 30 ngày. `GET /api/session` refresh session khi access token hết hạn; `DELETE /api/session` xóa cả hai cookie.

Service role key, Apps Script proxy secret và refresh token không được render vào React props, HTML hoặc JavaScript bundle. Auth foundation dùng JWT người dùng để đọc chính row `app_users` qua RLS `Read own app user`; không cần service role. Các API nghiệp vụ khác vẫn giữ server credential và proxy secret hiện có. Server Components và Vercel API có thể xác thực bằng cookie; Bearer JWT cũ vẫn được hỗ trợ trong giai đoạn compatibility.

## 3. Request user và RBAC

Request user giữ nguyên contract `id`, `username`, `email`, `role`, `displayName`. Cookie không cấp quyền mới. Mọi token vẫn phải qua Supabase Auth và active allowlist. `runtimeContext` là action read-only cho cả ba role; các action khác giữ nguyên `AuthorizationPolicy` hiện tại.

## 4. Workbook/year context

Nguồn có thẩm quyền tại Vercel server là `DEFAULT_WORKBOOK_YEAR` và `WORKBOOK_CONTEXTS_JSON` theo dạng `{ "2026": { "transport": "...", "cashflow": "..." } }`.

Resolver chỉ nhận `module` (`transport` hoặc `cashflow`) và năm bốn chữ số. Spreadsheet ID do server lấy từ allowlist cấu hình, không nhận ID tùy ý từ browser, không chọn bundle mới nhất và không dùng active spreadsheet. Public context chỉ trả `module` và `year`.

## 5. Vertical slice read-only

`/next-accounts/foundation/` là Server Component động: đọc cookie tại server, xác minh user/allowlist, resolve workbook context và render display name, role, module, year. Route không render Spreadsheet ID, không đọc hoặc ghi Google Sheet.

Đây chỉ là proof foundation. Report, Dashboard, Manage, Entry, Catalog và Cashflow chưa được chuyển sang request context mới trong A1.

## 6. Verification và rollback

Local gate: `npm test`, `npm run build`, `git diff --check`.

Smoke chưa đăng nhập đã đạt trên production: `/`, shell, Report và Foundation `200`; session/runtimeContext không token `401`; CSRF/origin sai bị chặn. Smoke đăng nhập, ba role và sign-out còn chờ tài khoản test được đăng nhập trong trình duyệt.

Deployment canary đã xác nhận: `dpl_FPfWQJauYCf64iF2W5FY4rfL3GCq`. Deployment production chứa same-origin rewrite: `dpl_D5wgai8jwCkGESyhP9SDJPpTzqXS`. Rollback production gần nhất trước rewrite ổn định: `dpl_HPz42VCJUgQdGH1KsKvA1D1cz1kq` hoặc checkpoint Phase 6 `dpl_y3oddZTTtfmFewyQyTwYjwTnRDtV`.
