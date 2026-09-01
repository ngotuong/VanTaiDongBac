# TARGET_ARCHITECTURE

## 1. Mục đích

Tài liệu này định nghĩa kiến trúc đích dài hạn của hệ thống Vận tải Đông Bắc.

Mọi thay đổi kiến trúc hoặc refactor phải:

- đưa hệ thống tiến gần hơn tới kiến trúc đích;
- giữ nguyên nghiệp vụ và giao diện nếu step không được phê duyệt để thay đổi chúng;
- có thể kiểm thử, deploy và rollback độc lập;
- giải thích rõ lý do nếu thay đổi không trực tiếp phục vụ kiến trúc đích.

Đây là định hướng dài hạn, không phải quyền tự động rewrite hoặc migration. Coding Agent chỉ được thực hiện step đã được người dùng phê duyệt rõ ràng.

## 2. Nguyên tắc tổng quát

Hệ thống tiến tới layered architecture, trong đó:

- mỗi layer có trách nhiệm và ownership rõ ràng;
- dependency đi theo chiều được định nghĩa, không truy cập chéo tùy ý;
- domain rules không phụ thuộc UI;
- public API, spreadsheet schema và data contract được quản lý rõ ràng;
- migration được thực hiện từng bước nhỏ, có compatibility boundary và rollback.

Không rewrite toàn hệ thống trong một lần.

## 3. Presentation Layer

Frontend mục tiêu sử dụng Next.js làm giao diện chính.

Presentation Layer chỉ chịu trách nhiệm:

- render giao diện;
- điều hướng;
- gọi API;
- quản lý trạng thái giao diện;
- validation phục vụ trải nghiệm người dùng;
- hiển thị trạng thái pending, processing, synced và failed từ API.

Presentation Layer không được:

- chứa business rule có thẩm quyền;
- tự suy diễn số liệu báo cáo khi backend/Google Sheet đã có nguồn chuẩn;
- truy cập Google Sheets trực tiếp;
- chứa Supabase service role key hoặc server secret;
- tự vượt qua API/RBAC contract.

Sau D1, Next.js là presentation layer duy nhất trong source hiện hành. Frontend vanilla chỉ còn trong Git/deployment rollback lịch sử, không còn được build hoặc deploy từ nhánh hiện tại.

## 4. Edge/API Layer

Next.js server/API proxy là public edge của web app.

Layer này chịu trách nhiệm:

- xác thực Supabase session;
- kiểm tra allowlist và role;
- validate request ở boundary;
- giới hạn method/action/payload;
- chuyển request hợp lệ tới Apps Script;
- chuẩn hóa lỗi transport phù hợp cho frontend.

Layer này không được:

- chứa business workflow của Vận tải hoặc Thu chi;
- đọc/ghi Google Sheets trực tiếp;
- đưa server secret xuống browser;
- bỏ qua authorization tại boundary.

## 5. Application and Integration Layer

Apps Script là application/API integration backend của hệ thống.

Apps Script chịu trách nhiệm:

- kiểm tra security context được chuyển từ trusted proxy;
- enforce các authorization invariant cần bảo vệ ở backend;
- điều phối use case nghiệp vụ;
- gọi domain service;
- giao tiếp Google Sheets;
- giao tiếp Supabase qua client/repository rõ ràng;
- chạy worker, trigger, đồng bộ cache và audit;
- bảo toàn idempotency và rollback semantics.

Apps Script không render HTML sau khi migration frontend hoàn tất; `doGet`/`doPost` chỉ giữ API/integration boundary.

## 6. Domain Layer

Mỗi module nghiệp vụ phải có:

- ownership rõ ràng;
- API contract rõ ràng;
- data contract rõ ràng;
- service/repository boundary phù hợp;
- characterization và contract tests;
- dependency được khai báo và kiểm soát.

Domain rules:

- không phụ thuộc UI hoặc DOM;
- không gọi frontend helper;
- không truy cập chéo module tùy ý;
- không tự thay đổi spreadsheet schema;
- không phụ thuộc trực tiếp HTTP transport nếu có thể đi qua client/repository;
- không coi cache là source of truth.

Hai domain chính phải tiếp tục độc lập:

1. Vận tải.
2. Thu chi/Quỹ.

Thu chi không được hiểu là một phần import phụ của Vận tải. Các liên kết hiện có qua công thức/`IMPORTRANGE` phải được bảo toàn cho đến khi có migration riêng được phê duyệt.

## 7. Data Layer

### 7.1. Google Sheets

Google Sheets là source of truth và nguồn đối soát cuối cùng trong kiến trúc mục tiêu hiện được phê duyệt.

Không được tự ý:

- đổi tên sheet;
- đổi thứ tự cột;
- xóa hoặc ghi đè công thức;
- đổi named range;
- gộp workbook Vận tải và Thu chi;
- dùng active spreadsheet làm nguồn chính của standalone web app.

Thay đổi schema chỉ được thực hiện bằng migration riêng đã được phê duyệt.

### 7.2. Supabase

Supabase đảm nhiệm:

- Auth;
- read model;
- cache layer;
- write queue đã được định nghĩa bằng contract;
- sync status và operational logs.

Không ghi trực tiếp vào Supabase nếu write path chưa được định nghĩa trong API/data/queue contract.

Supabase không được âm thầm trở thành source of truth. Mọi thay đổi vai trò này cần một quyết định kiến trúc và migration riêng.

## 8. Dependency direction mục tiêu

```text
Browser / Next.js UI
        ↓
Next.js server/API proxy
        ↓
Apps Script public API / application services
        ↓
Domain services
        ↓
Google Sheet adapters / Supabase repositories
        ↓
Google Sheets source of truth / Supabase read model, cache, queue
```

Không layer nào được đi ngược dependency direction chỉ để thuận tiện cho một thay đổi cục bộ.

## 9. Refactor principles

Mỗi step refactor phải:

1. Hoàn thành độc lập.
2. Có characterization/contract test phù hợp.
3. Giữ public compatibility hoặc có migration consumer riêng.
4. Không thay đổi nghiệp vụ nếu chưa được phê duyệt.
5. Không thay đổi giao diện nếu chưa được phê duyệt.
6. Không làm gián đoạn production.
7. Có thể deploy ngay sau verification.
8. Có thể rollback bằng commit/deployment checkpoint.
9. Không trộn nhiều layer hoặc nhiều mục tiêu không liên quan trong cùng step.
10. Cập nhật `PROJECT_CONTEXT.md` sau khi trạng thái thực tế thay đổi.

Nếu một thay đổi không phục vụ trực tiếp kiến trúc mục tiêu, change proposal phải giải thích:

- vấn đề cụ thể cần giải quyết;
- vì sao thay đổi vẫn cần thiết;
- ảnh hưởng tới kiến trúc mục tiêu;
- cách tránh tạo thêm technical debt.

## 10. Trạng thái chuyển đổi hiện tại

Migration Next.js A1–D1 và chương trình refactor Step 1–36 đã hoàn thành. Next.js hiện là presentation production; Apps Script là API/integration backend; Google Sheets vẫn là source of truth và Supabase là Auth/read model/cache/queue.

Tóm tắt current state, deployment, checkpoint gần nhất và checkpoint tiếp theo chỉ thuộc `PROJECT_CONTEXT.md`. Chi tiết các giai đoạn đã hoàn tất được tra cứu qua Git history, không dùng plan/spec lịch sử làm backlog sống.

## 11. Cổng phê duyệt dành cho Coding Agent

Khi bắt đầu một cuộc trò chuyện mới, Coding Agent phải:

1. Đọc `AGENTS.md` và toàn bộ `PROJECT_CONTEXT.md`.
2. Kiểm tra `git status --short`.
3. Báo lại ngắn gọn:
   - dự án là gì;
   - kiến trúc hiện tại;
   - checkpoint hiện tại;
   - mục tiêu kiến trúc dài hạn;
   - step tiếp theo được đề xuất;
   - các rủi ro hoặc điều kiện cần lưu ý.
4. Không sửa file, chạy migration, deploy, commit hoặc push.
5. Chờ người dùng phê duyệt rõ ràng một step cụ thể.

Việc người dùng yêu cầu đọc dự án hoặc báo trạng thái không được hiểu là phê duyệt triển khai step tiếp theo.

## 12. Prompt chuẩn cho cuộc trò chuyện mới

```text
Hãy đọc AGENTS.md và thực hiện quy trình khởi động của dự án.
Chỉ báo cáo trạng thái và dừng chờ phê duyệt.
```

`AGENTS.md` và `PROJECT_CONTEXT.md` là hai file bắt buộc. `docs/ai/AI_START_HERE.md` chỉ định tài liệu chuyên biệt cần đọc khi loại tác vụ yêu cầu.

## 13. Quyền sở hữu tài liệu

- Kiến trúc đích: `TARGET_ARCHITECTURE.md`.
- Trạng thái/checkpoint sống: `PROJECT_CONTEXT.md`.
- Roadmap/checkpoint đang hoạt động: `PROJECT_CONTEXT.md` và plan đã được người dùng phê duyệt trong task hiện tại.
- Lịch sử migration/refactor đã hoàn tất: Git history và timeline rút gọn trong `PROJECT_CONTEXT.md`.
- Kiến trúc hiện tại: `docs/architecture/SYSTEM_ARCHITECTURE.md`.
- Module ownership: `docs/architecture/MODULE_MAP.md`.
- Contract: `docs/contracts/`.
- Quy tắc khởi động Agent: `docs/ai/AI_START_HERE.md`.

Không dùng tài liệu này để ghi lịch sử triển khai hoặc checkpoint tạm thời.
