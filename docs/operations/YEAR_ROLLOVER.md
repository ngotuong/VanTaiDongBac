# YEAR_ROLLOVER

Runbook tạo và chuyển dữ liệu sang năm mới từ webapp. Mỗi năm vẫn có một workbook Vận tải và một workbook Thu chi riêng; Google Sheets tiếp tục là source of truth. Quy trình không gộp workbook, không đổi tên sheet/thứ tự cột và không sửa workbook năm nguồn.

## 1. Registry năm

Migration `020_year_rollover_self_service.sql` tạo hai bảng server-only:

- `workbook_contexts`: exact pair Vận tải/Thu chi theo năm và trạng thái `draft | ready | active | archived | failed`;
- `workbook_rollover_runs`: kế hoạch, audit và trạng thái từng lượt chuẩn bị.

Browser chỉ nhận `year`, trạng thái và tên hiển thị; Spreadsheet ID không đi xuống client. Next server đọc registry bằng service role. Trong giai đoạn chuyển đổi, `WORKBOOK_CONTEXTS_JSON` và `DEFAULT_WORKBOOK_YEAR` vẫn là fallback chính xác khi migration `020` chưa tồn tại hoặc registry còn rỗng. Khi registry có row, trạng thái trong registry thắng fallback; `draft`/`failed` không xuất hiện trong bộ chọn năm.

Apps Script giữ mapping runtime:

```text
SPREADSHEET_ID_YYYY=<workbook Vận tải>
FUND_SPREADSHEET_ID_YYYY=<workbook Thu chi>
CASHFLOW_SPREADSHEET_ID_YYYY=<alias tương thích của Thu chi>
ACTIVE_WORKBOOK_YEAR=YYYY
DEFAULT_WORKBOOK_YEAR=YYYY
ACTIVE_SPREADSHEET_ID=<workbook Vận tải hiện hành>
```

Năm `ready`/`archived` chỉ đọc; chỉ năm `active` được ghi. Cache, queue, signal, lease, cursor và data-version tiếp tục namespace theo năm như migration `019` và cache contract.

## 2. Manifest một lần

Manifest 2026 → 2027 đã duyệt được đóng gói server-side trong `YearRolloverManifestCatalog.gs`, nên Preview/canary không phụ thuộc helper tạm hoặc bước ghi Script Properties. Apps Script Property `YEAR_ROLLOVER_MANIFEST_JSON` vẫn là template dùng lại cho năm sau; có thể dùng `$SOURCE_YEAR` và `$TARGET_YEAR` trong `version`, `targetYear`, tên file và giá trị ghi. Nếu cần ngoại lệ một năm, property `YEAR_ROLLOVER_MANIFEST_YYYY_JSON` được ưu tiên hơn catalog và template chung.

Trong Cài đặt > Năm dữ liệu, quản trị viên có thể chạy canary trước khi tạo thật. Canary tạo hai bản sao có tiền tố `__CANARY_ROLLOVER_`, áp cùng manifest và audit, rồi bắt buộc đưa cả hai bản sao tạm vào thùng rác. Request web chỉ xếp một job nền và trả về ngay để không phụ thuộc giới hạn chờ 55 giây của Vercel. Trạng thái job được ghi vào `workbook_rollover_runs`; browser poll trạng thái server, không giữ kết nối dài với Apps Script. Canary không ghi `workbook_contexts`, không đặt ID workbook cho năm đích và chỉ chuyển job sang `ready` khi cleanup đã hoàn tất.

Manifest bắt buộc:

- `approved=true`, version, `targetYear`, thư mục Drive đích và tên hai workbook;
- `clearRanges`: range A1 hữu hạn; chỉ xóa ô không có công thức trên bản sao;
- `formulaReplacements`: thay chính xác token/ID trong range công thức đã khai báo;
- `carryovers`: copy range nguồn sang range đích cùng kích thước;
- `snapshots`: kết chuyển gọn số dư Quỹ, dư nợ vay, công nợ còn mở và số dư lương còn hoạt động; không sao chép toàn bộ lịch sử năm cũ;
- `setValues`: ghi một ô chính xác, ví dụ năm cấu hình.
- `audit.sourceYearFormulaAllowlist`: danh sách ô công thức được phép giữ năm nguồn vì đó là mốc hiệu lực lịch sử, kèm lý do nghiệp vụ; các ô khác vẫn bị cảnh báo.

Mỗi operation phải chỉ rõ module, sheet và range. Range cả cột, range vượt 250.000 ô, sheet không tồn tại hoặc replacement bắt buộc không tìm thấy đều bị chặn. Khi cấu trúc workbook thay đổi, cập nhật manifest bằng checkpoint riêng; không nới thành tìm-thay thế toàn workbook.

Snapshot công nợ Thu chi phải khai báo `categoryValidation` cho danh sách MỤC THU, MỤC CHI và vùng loại trừ lẫn nhau. Trên đúng các dòng snapshot của bản sao, worker tạm gỡ validation C:D trước khi ghi rồi khôi phục rule tương đương script gốc. Cách này tránh Google Sheets từ chối ô trống ở cột đối diện mà vẫn giữ validation nhập liệu cho workbook năm mới.

## 3. Quy trình trên webapp

Chỉ admin thấy `Cài đặt > Năm dữ liệu`.

1. **Kiểm tra kế hoạch**: preflight chỉ đọc tên/metadata hai workbook nguồn, folder đích, dữ liệu snapshot và công thức cần thay; không tạo bản sao và không ghi Sheet/registry/property.
2. **Canary kỹ thuật**: endpoint tạo một run `planned` và time-trigger một lần rồi trả về. Worker tạo hai bản sao tên `__CANARY_ROLLOVER_*`, chuyển trạng thái `copying`/`auditing`, áp toàn bộ manifest, kiểm thứ tự sheet/công thức/snapshot rồi đưa cả hai vào thùng rác trong cùng lượt. Job chỉ chuyển `ready` sau khi Drive xác nhận cả hai file đã vào thùng rác; không đăng ký workbook context hoặc ID năm đích. UI tự poll và có thể đóng trang trong lúc worker chạy.
3. **Tạo workbook YYYY**: endpoint chỉ tạo run `planned`, lưu job server-side và trả về ngay. Worker nền giữ script lock, từ chối nếu năm đích đã có ID, xác nhận migration `020` trước mọi Drive write rồi dùng `DriveApp.makeCopy` tạo đúng hai bản sao trong thư mục đã định.
4. **Chuẩn bị bản sao**: worker đăng ký ID vào Script Properties/registry ở trạng thái `draft` rồi chỉ sửa range manifest trên hai bản sao; workbook nguồn chỉ được đọc. Mỗi trigger chỉ áp một operation và lưu `applyIndex` sau khi flush thành công. Trigger kế tiếp tiếp tục đúng operation chưa ghi nhận; vì vậy lỗi tạm thời của Google Sheets không buộc chạy lại toàn bộ manifest trong một lượt 6 phút. Khi mọi operation hoàn tất, worker xếp một trigger audit riêng.
5. **Audit nền**: worker riêng so thứ tự sheet/header/cột/named range, công thức còn ID/năm cũ, input năm cũ, số dư/dư nợ/công nợ/`NL_SoDuLuong`, queue/signal/lease/write job. Trước ngày 01/01 của năm đích, số dư Quỹ được đối chiếu theo số dư mở đầu cộng dòng tiền vay đã kết chuyển có đi qua Quỹ; không dùng chỉ số “hiện tại” vốn chưa tính các dòng mang ngày tương lai. Ghi chú audit-trail do hệ thống sinh (`Chuyển tiếp công nợ/dư nợ từ YYYY`) không bị coi là input cũ. Các công thức chứa năm nguồn chỉ được miễn cảnh báo khi đúng ô và lý do đã khai báo trong allowlist manifest. Audit dùng kế hoạch checkpoint versioned; các phép quét công thức được chia theo batch tối đa ba sheet, các nhóm còn lại chạy riêng. Mỗi trigger chỉ chạy một nhóm rồi lưu kết quả vào property riêng để không vượt giới hạn kích thước một Script Property. Trước mỗi nhóm, worker đặt một trigger an toàn trễ 7 phút; nếu Apps Script bị dừng cứng ở giới hạn 6 phút, trigger này tự chạy lại đúng nhóm chưa checkpoint. Lỗi bắt được thử lại tối đa ba lần. Sheet vượt giới hạn scan là blocker. Nút audit thủ công cũng chỉ xếp job nền và trả về ngay.
6. **Sẵn sàng**: audit không blocker mới chuyển context sang `ready`. Nếu lỗi, hai bản sao giữ `failed` để điều tra; không tự xóa bằng retry và không tạo bản sao trùng.
7. **Chuẩn bị kích hoạt**: tạo confirmation token từ snapshot audit hiện tại. Token hết hiệu lực nếu ID, blocker, warning hoặc queue thay đổi.
8. **Kích hoạt**: admin nhập đúng năm đích; Vercel phải bật `BUSINESS_WRITES_PAUSED`, Apps Script phải có `WRITE_QUEUE_PAUSED=true`, queue/signal/lease phải rỗng. Apps Script đổi properties và trigger, sau đó RPC idempotent `activate_workbook_context` atomically chuyển nguồn sang `archived`, đích sang `active`. Nếu phản hồi RPC bị mất, service đọc lại registry: commit đã hoàn tất được chấp nhận, trạng thái nguồn còn active mới rollback; nếu không đọc xác định được thì giữ maintenance và trạng thái hiện tại để đối soát, không rollback mù.

Nếu worker chuẩn bị hết thời gian sau khi hai workbook đã được đăng ký, giao diện hiện **Tiếp tục chuẩn bị**. Thao tác này tạo run phục hồi mới trên đúng hai workbook hiện có; không tạo thêm bản sao. Mỗi operation đã hoàn tất trong run được checkpoint riêng. Nếu Apps Script dừng đột ngột trước khi ghi checkpoint, operation hiện tại được chạy lại theo cách idempotent. Formula replacement bắt buộc chấp nhận cả trạng thái “đã thay đúng ID đích” để retry không ghi lại công thức lần nữa. Nếu audit gặp lỗi hạ tầng Google, **Chạy audit lại** tạo job chỉ đọc mới; audit checkpoint tiếp tục từng nhóm và không áp lại manifest.

Ứng dụng không yêu cầu người dùng tự tạo file hoặc nhập Spreadsheet ID.

## 4. Gate triển khai lần đầu

1. Local: `npm test`, `npm run test:sql`, `npm run lint`, `npm run typecheck`, `npm run build`, identity guard và `git diff --check`.
2. Xin phê duyệt live riêng cho migration `019` và `020`; cả hai additive, giữ row/cache cũ.
3. Bật Google Drive API cho GCP project liên kết, thêm scope `https://www.googleapis.com/auth/drive` và owner cấp OAuth một lần. Scope này chỉ dùng để đọc metadata preflight, tạo hai bản sao trong folder manifest và đưa bản sao canary/copy lỗi vào thùng rác. Scope `https://www.googleapis.com/auth/script.scriptapp` dùng cho worker canary một lần.
4. Cấu hình và review manifest bằng exact workbook copy/canary; không chạy trực tiếp trên workbook nguồn.
5. Deploy Apps Script/Preview theo `WORKFLOW.md`; xác minh 2026 vẫn đọc/ghi, registry/selector không lộ ID và operator/shareholder không gọi được action admin.
6. Chỉ sau một phê duyệt tạo file live riêng mới bấm tạo hai workbook 2027. Audit/QA Preview phải PASS trước cửa sổ kích hoạt Production.

## 5. Kích hoạt và hậu kiểm

1. Lưu deployment/version rollback, trạng thái trigger, queue và properties không chứa secret.
2. Pause cả hai lớp ghi, drain chính xác; không clear queue/cursor để ép qua gate.
3. Prepare token rồi activate trong cùng cửa sổ.
4. Chạy full sync năm đích; kiểm cache/report/payroll/Quỹ/dashboard/danh mục/thông báo theo năm.
5. QA authenticated trên Preview: selector năm, năm cũ chỉ đọc, API mutation năm cũ trả 409, năm mới đúng công thức/carry-over.
6. Production cần phê duyệt riêng. Sau mở ghi, theo dõi execution/error-rate, stale cache, queue và watchdog tối thiểu 24 giờ.

## 6. Rollback

- Trước activation: giữ bản sao `draft/failed`, sửa bằng migration/manifest đã duyệt rồi audit lại. Không retry tạo file và không xóa tự động hai bản sao đã đăng ký.
- Activation lỗi xác định trước commit: `YearRolloverMigration.activate` khôi phục properties và trigger năm nguồn. RPC registry là transaction/idempotent. Trạng thái mạng không xác định giữ maintenance và yêu cầu đọc lại registry trước khi quyết định; không kích hoạt bằng hàm editor trực tiếp.
- Sau activation: giữ writes paused, đưa deployment và active properties/triggers về năm nguồn bằng cửa sổ rollback được duyệt, rồi dùng forward correction cho registry. Không xóa migration `019/020`, cache namespaced, signal, job, journal hoặc dữ liệu Sheet.
- Nếu đã có write năm đích, đối soát exact job/row trước khi chọn năm hoạt động; không restore toàn workbook.
