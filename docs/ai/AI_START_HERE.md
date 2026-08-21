# AI_START_HERE

## 1. Mục đích

Đây là router tài liệu dành cho Coding Agent. File này không lặp lại trạng thái dự án, roadmap, schema hoặc contract.

Nguồn bắt đầu bắt buộc:

1. `AGENTS.md` — quy tắc an toàn và phạm vi hành động.
2. `PROJECT_CONTEXT.md` — current-state handoff duy nhất.

Chỉ hai file trên là bắt buộc cho mọi cuộc trò chuyện mới. Các tài liệu khác chỉ đọc khi loại tác vụ yêu cầu.

## 2. Quy trình khởi động mặc định

Khi người dùng yêu cầu đọc dự án, báo trạng thái hoặc “thực hiện quy trình khởi động”:

1. Đọc toàn bộ `AGENTS.md`.
2. Đọc toàn bộ `PROJECT_CONTEXT.md`.
3. Kiểm tra `git status --short`.
4. Kiểm tra source trực tiếp nếu cần xác minh một kết luận có khả năng stale; timeline rút gọn đã nằm trong `PROJECT_CONTEXT.md`.
5. Báo ngắn gọn đúng sáu nội dung:
   - dự án và module chính;
   - kiến trúc hiện tại;
   - checkpoint gần nhất;
   - checkpoint tiếp theo được đề xuất;
   - kiến trúc đích;
   - rủi ro/điều kiện trước checkpoint tiếp theo.
6. Dừng và chờ phê duyệt rõ ràng.

Yêu cầu đọc/báo trạng thái không tự động cho phép sửa file, migration, deploy, commit, push hoặc bắt đầu checkpoint tiếp theo.

## 3. Router theo loại tác vụ

### Kiến trúc đích hoặc điều tra migration Next.js lịch sử

Đọc thêm:

- `TARGET_ARCHITECTURE.md`;
- `docs/architecture/SYSTEM_ARCHITECTURE.md`;
- source frontend/Next trực tiếp liên quan.

Chỉ đọc `NEXTJS_MIGRATION_PLAN.md` khi cần điều tra roadmap A1–D1 đã hoàn thành hoặc regression lịch sử.

### API, Auth hoặc RBAC

Đọc thêm:

- `docs/contracts/API_CONTRACTS.md`;
- `docs/contracts/RBAC_MATRIX.md`;
- `api/app.js` và service/repository/call site liên quan.

### Google Sheet hoặc nghiệp vụ dữ liệu

Đọc thêm:

- `PROJECT_SCHEMA.md`;
- `docs/contracts/SPREADSHEET_CONTRACTS.md`;
- schema snapshot và service trực tiếp liên quan.

Không đổi tên sheet, thứ tự cột, named range hoặc công thức. Backend standalone phải ưu tiên `SpreadsheetApp.openById(id)`.

### Supabase, cache hoặc write queue

Đọc thêm:

- `SUPABASE_SCHEMA.md`;
- migrations theo thứ tự;
- `docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md`;
- repository/service và frontend call site liên quan.

Migration đã chạy là lịch sử bất biến. Không sửa migration cũ.

### Thu chi/Quỹ và bound script

Đọc thêm:

- phần Thu chi trong `PROJECT_SCHEMA.md`;
- `docs/legacy/THU_CHI_BOUND_SCRIPT.md`;
- schema snapshot Thu chi;
- `FundService.gs` và frontend module liên quan;
- `docs/source/thu_chi_bound_script/` nếu hành vi có thể phát sinh trong Sheet.

Bound script và Apps Script backend standalone là hai execution context khác nhau.

### Deploy, trigger hoặc rollback

Đọc thêm:

- `WORKFLOW.md`;
- `ROLLBACK.md`;
- `SUPABASE_SETUP.md` nếu có cấu hình Supabase/Auth;
- deployment checkpoint trong `PROJECT_CONTEXT.md`.

### Test hoặc risk review

Đọc thêm:

- `docs/quality/TEST_STRATEGY.md`;
- `docs/quality/KNOWN_RISKS.md`;
- test source trực tiếp liên quan.

### UI/UX, form hoặc drawer nhập liệu

Đọc thêm:

- `docs/contracts/BUSINESS_FORM_SHEET_CONTRACT.md`;
- component và stylesheet trực tiếp liên quan.

Form ghi dữ liệu mobile phải dùng contract chung; không thêm chiều cao cố định, typography hoặc footer riêng theo module.

### Lịch sử refactor

Chỉ khi cần rationale hoặc điều tra regression, đọc:

- `AUDIT_REPORT.md`;
- `REFACTOR_PLAN.md`;
- `CHANGELOG.md`;
- Git history.

Hai file audit/plan cũ không được dùng để quyết định checkpoint tiếp theo.

## 4. Thứ tự ưu tiên khi mâu thuẫn

1. Yêu cầu hiện tại, rõ ràng của người dùng.
2. Quy tắc an toàn trong `AGENTS.md`.
3. Production/live state đã xác minh.
4. Source code và migration hiện hành.
5. Contract docs.
6. Schema snapshot.
7. Living context.
8. Historical docs/commit messages.

Không âm thầm chọn một nguồn khi có mâu thuẫn. Phải báo discrepancy và xác minh trong phạm vi được phép.

## 5. Trước và sau thay đổi

Trước khi sửa:

- xác nhận checkpoint/phạm vi được phê duyệt;
- kiểm tra Git và thay đổi đang tồn tại;
- xác định source tác giả, artifact sinh tự động, API/RBAC/cache/Sheet bị ảnh hưởng;
- trình bày kế hoạch ngắn bằng tiếng Việt.

Sau khi sửa:

- báo file đã sửa và mục đích;
- báo hành vi thay đổi/giữ nguyên;
- chạy verification phù hợp;
- nêu phần chưa kiểm tra, migration/deploy cần thiết và rollback;
- cập nhật `PROJECT_CONTEXT.md` nếu trạng thái checkpoint/kiến trúc thực sự thay đổi.

Không chạy test có khả năng ghi production nếu chưa được phê duyệt rõ ràng.

## 6. Trạng thái tài liệu

- Loại: `CURRENT` AI documentation router.
- Owner: thứ tự đọc và routing tài liệu theo tác vụ.
- Không sở hữu: current state, roadmap, contract hoặc lịch sử.
- Nguồn current state: `PROJECT_CONTEXT.md`.
- Ngày xác nhận: 2026-08-10.
