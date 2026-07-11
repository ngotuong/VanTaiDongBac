# AI_START_HERE

## 1. Mục đích

Đây là điểm bắt đầu bắt buộc dành cho Coding Agent làm việc với dự án Vận tải Đông Bắc.

Tài liệu này giúp Agent:

- hiểu đúng phạm vi và kiến trúc hệ thống trước khi hành động;
- biết tài liệu hoặc source nào có thẩm quyền cho từng loại thông tin;
- tránh làm hỏng tên sheet, thứ tự cột, công thức và luồng đồng bộ dữ liệu;
- phân biệt trạng thái hiện tại với lịch sử triển khai;
- thực hiện thay đổi có kiểm soát và để lại handoff đủ rõ cho Agent tiếp theo.

Tài liệu này không thay thế tài liệu kiến trúc, schema, API hay vận hành chi tiết. Nó quy định thứ tự và cách sử dụng các tài liệu đó.

## 2. Bối cảnh tối thiểu phải hiểu

Đây là Apps Script Web App độc lập, không gắn cố định với một Google Sheet cụ thể.

Hệ thống hiện có bốn thành phần chính:

1. Frontend/PWA được build từ `index.template.html`, `client_*.html`, `styles_*.html` và deploy trên Vercel.
2. Vercel API proxy xác thực Supabase session, kiểm tra allowlist/role rồi chuyển tiếp request hợp lệ đến Apps Script.
3. Apps Script cung cấp API, đọc/ghi Google Sheets, chạy worker, trigger và đồng bộ cache.
4. Supabase cung cấp Auth, cache đọc, trạng thái đồng bộ và write queue.

Google Sheets vẫn là nguồn dữ liệu đối soát cuối cùng trong giai đoạn hiện tại. Supabase chưa thay thế Google Sheets làm source of truth.

Hệ thống có hai module nghiệp vụ độc lập:

- Vận tải: dữ liệu nằm trong file Google Sheet Vận tải theo từng năm.
- Thu chi/Quỹ: dữ liệu nằm trong file Google Sheet Thu chi theo từng năm và được trình bày như một menu riêng trong web app.

Không được hiểu Thu chi chỉ là nguồn import của Vận tải. Hai module có nghiệp vụ riêng; một số liên kết hiện được thực hiện bằng công thức Google Sheets, bao gồm `IMPORTRANGE`.

## 3. Thứ tự đọc bắt buộc

### 3.1. Với mọi tác vụ

Đọc theo thứ tự:

1. `AGENTS.md`
2. `docs/ai/AI_START_HERE.md`
3. `PROJECT_CONTEXT.md`
4. `PROJECT_SCHEMA.md`
5. Các file source trực tiếp liên quan đến tác vụ

Không chỉ dựa vào tên file hoặc tài liệu tóm tắt để suy đoán hành vi. Trước khi đề xuất thay đổi, phải kiểm tra source đang chạy.

### 3.2. Khi liên quan Supabase, cache hoặc write queue

Đọc thêm:

1. `SUPABASE_SCHEMA.md`
2. Các migration trong `supabase/migrations/` theo đúng thứ tự số
3. `SupabaseService.gs`
4. Các call site frontend liên quan

Migration đã chạy là lịch sử bất biến. Không sửa migration cũ để thay đổi production; phải tạo migration mới khi được phê duyệt.

### 3.3. Khi liên quan deploy, trigger hoặc rollback

Đọc thêm:

1. `WORKFLOW.md`
2. `SUPABASE_SETUP.md` nếu có cấu hình Supabase/Auth
3. `ROLLBACK.md`
4. Trạng thái deployment mới nhất trong `PROJECT_CONTEXT.md`

Không deploy, push, chạy migration hoặc cài/xóa trigger nếu người dùng chưa yêu cầu hay chưa cho phép rõ ràng.

### 3.4. Khi liên quan Google Sheet Thu chi

Đọc thêm:

1. Phần Thu chi trong `PROJECT_SCHEMA.md`
2. `docs/schema/thu_chi_2026_schema_raw_20260625_175010.json`
3. `FundService.gs`
4. `client_cashflow.html`
5. Mã bound script trong `docs/source/thu_chi_bound_script/` nếu hành vi có thể phát sinh trực tiếp trong Google Sheet

Mã trong `docs/source/thu_chi_bound_script/` thuộc Apps Script gắn với file Thu chi, không phải backend Apps Script độc lập của web app. Không copy mã giữa hai môi trường nếu chưa có quyết định kiến trúc.

### 3.5. Khi liên quan frontend

Source tác giả là:

- `index.template.html`
- `client_*.html`
- `styles_*.html`

`index.html` là artifact được sinh bởi `scripts/build.js`. Không sửa logic trực tiếp trong `index.html`. Sau khi source frontend được sửa và được phép triển khai, phải build lại để tạo `index.html`.

## 4. Thứ tự ưu tiên nguồn thông tin

Khi có mâu thuẫn, áp dụng thứ tự sau:

1. Yêu cầu hiện tại, rõ ràng của người dùng.
2. Quy tắc an toàn trong `AGENTS.md`.
3. Source code và migration đang có trong repository.
4. Schema snapshot của Google Sheets.
5. Tài liệu mô tả trạng thái hiện tại.
6. Ghi chú lịch sử, commit message hoặc nhận định cũ.

Nếu source và tài liệu khác nhau:

- không âm thầm chọn một bên;
- xác định hành vi thực tế từ source và các contract/test hiện có;
- báo rõ điểm không đồng bộ;
- chỉ cập nhật tài liệu hoặc code theo phạm vi người dùng đã phê duyệt.

`PROJECT_CONTEXT.md` là living roadmap và handoff, không phải schema contract đầy đủ. Các ghi chú theo ngày trong đó mô tả lịch sử và có thể đã bị thay thế bởi thay đổi mới hơn.

## 5. Invariant không được vi phạm

Coding Agent không được tự ý:

- đổi tên sheet;
- đổi thứ tự cột;
- xóa hoặc ghi đè công thức trong Google Sheets;
- gộp file Vận tải và Thu chi;
- copy web app vào từng Google Sheet theo năm;
- dùng `SpreadsheetApp.getActiveSpreadsheet()` làm nguồn dữ liệu chính của web app độc lập;
- đưa Supabase service role key, proxy secret hoặc secret khác vào frontend;
- commit `.env`, credential hoặc token;
- sửa trực tiếp cấu trúc Google Sheet thay vì viết migration riêng;
- coi dữ liệu Supabase cache là nguồn đúng hơn Google Sheet;
- tự dựng lại ý nghĩa hoặc số liệu báo cáo khi Sheet đã có bảng/công thức chuẩn;
- sửa `index.html` thay cho source frontend;
- bật feature flag, trigger, migration hoặc deployment production ngoài phạm vi được duyệt.

Khi đọc/ghi dữ liệu chính, ưu tiên `SpreadsheetApp.openById(id)` với Spreadsheet ID đã được resolve đúng theo request/năm/Script Properties.

## 6. Những ranh giới dễ nhầm

### 6.1. Trực tiếp và bất đồng bộ

Không phải mọi thao tác ghi đều dùng cùng một đường đi.

- Một số thao tác Vận tải dùng Supabase write queue.
- Xóa vật lý nguyên dòng có thể vẫn chạy trực tiếp để tránh retry xóa nhầm.
- Thêm giao dịch Thu chi có queue theo feature flag.
- Các thao tác Thu chi khác vẫn có thể ghi trực tiếp.

Trước khi sửa một thao tác ghi, phải truy vết đầy đủ:

`frontend -> proxy/API action -> PublicApi -> service -> queue hoặc Sheet -> sync cache -> frontend reload/poll`

### 6.2. Cache và source of truth

Frontend có thể đọc Supabase trước và fallback Apps Script. Vì vậy dữ liệu hiển thị có thể đến từ nhiều nguồn, nhưng dữ liệu đối soát cuối cùng vẫn nằm trong Google Sheets.

Khi thay đổi đường ghi hoặc dữ liệu trả về, phải xác định cache nào cần được cập nhật và cache key/tháng nào bị ảnh hưởng.

### 6.3. Web app độc lập và bound script

`SpreadsheetApp.getActiveSpreadsheet()` có thể phù hợp trong bound script Thu chi vì script đó gắn với một file cụ thể. Điều này không làm cho cách dùng đó phù hợp trong backend web app độc lập.

### 6.4. Service facade và implementation

Các file `EntryService.gs`, `ManageService.gs`, `CatalogService.gs`, `ReportService.gs` và `SheetReadService.gs` tạo boundary theo tên nghiệp vụ, nhưng nhiều implementation hiện vẫn nằm trong `SheetService.gs`. Phải truy vết đến implementation thật trước khi kết luận phạm vi ảnh hưởng.

## 7. Checklist trước khi thay đổi

Trước mọi thay đổi code, schema hoặc tài liệu:

1. Xác nhận chính xác yêu cầu và phạm vi được phép.
2. Đọc `PROJECT_CONTEXT.md` và tài liệu chuyên biệt liên quan.
3. Chạy `git status --short`.
4. Xem thay đổi đang tồn tại và không ghi đè công việc của người dùng.
5. Xác định module, file nguồn và artifact sinh tự động.
6. Xác định Google Sheet, header row, cột, công thức và named range liên quan.
7. Xác định action API, role được phép và nơi enforce quyền.
8. Xác định thao tác ghi trực tiếp hay qua queue.
9. Xác định cache, trigger, audit và fallback bị ảnh hưởng.
10. Xác định test và cách rollback phù hợp.
11. Trình bày kế hoạch ngắn bằng tiếng Việt trước khi sửa.

Nếu một giả định có thể làm thay đổi nghiệp vụ, cấu trúc Sheet, công thức, quyền truy cập hoặc source of truth, phải hỏi lại thay vì tự quyết định.

## 8. Checklist kiểm chứng sau thay đổi

Tùy phạm vi, cần kiểm tra tối thiểu:

- source JavaScript/Apps Script hợp lệ;
- `npm test` đạt;
- frontend build thành công nếu đã sửa frontend source;
- không còn Apps Script template tag ngoài ý muốn trong bản static build;
- payload API vẫn đúng contract;
- role không được phép bị chặn ở proxy/backend, không chỉ bị ẩn nút;
- ghi Sheet không đổi tên, thứ tự cột hoặc xóa công thức;
- retry không tạo bản ghi trùng;
- cache liên quan được cập nhật hoặc fallback đúng;
- báo cáo khớp Google Sheet cho kỳ bị ảnh hưởng;
- rollback khả thi.

Không chạy test có khả năng ghi dữ liệu production nếu chưa được phép rõ ràng.

## 9. Yêu cầu handoff

Sau khi hoàn thành một thay đổi, Agent phải báo bằng tiếng Việt:

- đã sửa file nào;
- mỗi file được sửa để làm gì;
- hành vi nào thay đổi và hành vi nào được giữ nguyên;
- đã chạy kiểm tra nào và kết quả;
- chưa kiểm tra được phần nào;
- có cần migration, build, deploy, sync hoặc cài trigger hay không;
- cách người dùng test;
- rủi ro hoặc bước tiếp theo còn lại.

Khi có quyết định kiến trúc hoặc trạng thái roadmap mới, cập nhật `PROJECT_CONTEXT.md` trong cùng phạm vi thay đổi nếu người dùng cho phép sửa nhiều file.

## 10. Trạng thái tài liệu

- Loại tài liệu: entry point và quy tắc cộng tác dành cho AI.
- Phạm vi: toàn repository.
- Nguồn kiểm chứng: `AGENTS.md`, source code, schema snapshots, migrations và tài liệu vận hành hiện hành.
- Ngày xác nhận gần nhất: 2026-07-11.
- Cần cập nhật khi: kiến trúc thành phần, source of truth, thứ tự tài liệu, quy tắc an toàn hoặc quy trình Agent thay đổi.
