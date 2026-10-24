# BUSINESS_FORM_SHEET_CONTRACT

## 1. Phạm vi

Contract này triển khai primitive overlay/form của `UI_DESIGN_SYSTEM_CONTRACT.md`.

Đây là quy chuẩn giao diện cho các form ghi dữ liệu trên desktop và mobile:

- nhập mới Vận hành;
- sửa dữ liệu Vận hành;
- thêm/sửa Danh mục;
- nhập giao dịch Thu/Chi;
- nhập khoản vay và trả vay.

Các hộp xác nhận, bộ lọc và drawer chỉ đọc không thuộc contract này.

## 2. Cấu trúc chung

- Component gốc phải có thuộc tính `data-business-form-sheet`.
- Form đặt giữa viewport theo cả hai trục, rộng theo ba mức dùng chung: `compact 680px`, `standard 840px`, `wide 920px`; trên mobile chừa gutter `10px` mỗi bên. Form cao theo nội dung và chỉ cuộn khi vượt quá `92dvh`.
- Không neo form vào cạnh dưới hoặc cạnh phải. Swipe offset phải được cộng vào phép dịch từ tâm để thao tác kéo xuống vẫn liên tục, không làm form nhảy vị trí.
- Header, vùng nội dung và hàng hành động nằm liên tiếp trong luồng layout. Không dùng `flex-grow` để tạo khoảng trống giả giữa form và footer.
- Không có vùng rỗng sau footer: đáy footer phải chạm đáy trong của form (sai số border <=2px); đo sau khi animation kết thúc trên viewport cao và thấp.
- Footer theo ngay sau nội dung, có safe-area cho iOS và nút thao tác cao tối thiểu 44px. Khoảng đệm đáy lấy giá trị lớn hơn giữa `10px` và `safe-area-inset-bottom` để form cân giữa nhưng thao tác vẫn tránh vùng gesture của thiết bị.
- Đến `560px`, form dùng hai cột với gap ngang 8px: trường R7 ngắn khai báo `data-span="half"`, trường dài khai báo `full` (`data-mobile-span` chỉ thuộc wrapper cũ); thiếu metadata mặc định toàn hàng. Ngày/số/biển số/lựa chọn ngắn dùng nửa hàng; Các trường ngắn trong R7 được khai báo theo key/header để chia hàng, gồm Dự án–Số km; tên/nguồn dài hoặc chưa nhận diện, nội dung và ghi chú dùng toàn hàng. Không dùng grid dense/reorder để giữ thứ tự đọc và focus. Từ `561px` giữ hai cột desktop; `full-width`/`full` tiếp tục toàn hàng.
- Mã vay 12 chữ số và ô ngày chỉ được chia hàng khi còn đủ chiều rộng để đọc ở 320px; không giảm font nhập liệu. Checkbox dùng nhãn cùng dòng và không áp dụng layout nhãn/input xếp dọc.
- Date dùng đúng một lớp hiển thị `dd/mm/yyyy` ở mọi viewport. `input[type=date]` native phủ toàn control để giữ keyboard/picker/accessibility nhưng trong suốt về thị giác; không hiển thị đồng thời text native và text tùy biến.

## 3. Typography và mật độ

- Tiêu đề drawer: 18px / 700.
- Tiêu đề nhóm hoặc dòng: 14px / 700.
- Nhãn trường R7: 12px / 600, không ép chữ hoa, không letter-spacing.
- Nội dung trường nhập: 16px / 500 để tránh Safari tự phóng to khi focus.
- Input/select/date cao 44px; textarea mặc định 64px và chỉ tăng khi nội dung cần.
- Lưới trường R7: gap ngang 8px, dọc 12px; khoảng cách nhãn–control 4px. Wrapper card cũ giữ padding 11px.

## 4. Tương tác đóng

- Luôn có nút đóng hoặc hủy rõ ràng. Nút × dùng khung 44×44px, padding 0, bo 12px và không co theo flex trên cả desktop/mobile.
- Có thể chạm backdrop để yêu cầu đóng khi form cho phép.
- Vuốt xuống chỉ được bắt đầu từ vùng header/handle có thuộc tính `data-swipe-dismiss-handle`; tuyệt đối không bắt gesture từ khoảng trống trong nội dung form.
- Không bắt đầu thao tác vuốt từ input, select, textarea, button, link hoặc vùng `contenteditable`.
- Nếu nội dung đã cuộn xuống, ưu tiên cuộn nội dung và không đóng drawer.
- Nếu form đã thay đổi, mọi đường đóng do người dùng kích hoạt — vuốt, backdrop, nút đóng hoặc Hủy — phải yêu cầu xác nhận bỏ dữ liệu. Đóng sau khi lưu thành công được phép bỏ qua xác nhận.
- Khi đang gửi/lưu, vô hiệu hóa mọi thao tác đóng do người dùng để không che mất trạng thái kết quả.
- Tôn trọng `prefers-reduced-motion`.

## 5. Nguồn thực thi

- Token và overlay: `next-shell/app/platform.css`, khối `Business form sheet system`. Control/lưới R7: `BusinessPrimitives.tsx` + `business-primitives.module.css`; không thêm selector màu/font theo module để ghi đè component.
- Gesture: `next-shell/components/platform/useSwipeDismiss.ts`.
- Điểm gắn contract: `ManageReadOnlyModule.tsx`, `CatalogModule.tsx`, `EntryModule.tsx`, `CashflowModule.tsx`.

Module mới không được tự đặt chiều cao, font hoặc footer riêng cho form mobile nếu chưa cập nhật contract này.

Mọi drawer ghi dữ liệu phải khai báo `data-business-form-sheet`, kể cả thanh toán công nợ. Khi số trường không quá 5, dùng `data-business-form-size="compact"`; form nhiều nhóm dùng `wide`.

## 5.1. Contract phản hồi sau khi lưu

- Nút Lưu chỉ chờ Vercel xác nhận lệnh đã được ghi bền vững vào `write_jobs`; không chờ Apps Script mở workbook, ghi Google Sheet hoặc đồng bộ lại toàn bộ cache.
- Sau khi nhận `jobId`, form đóng theo animation chung, danh sách hiện tại cập nhật lạc quan và toast phải nói rõ dữ liệu đang đồng bộ nền.
- Mỗi thao tác ghi gửi `clientRequestId` duy nhất để retry mạng không tạo bản ghi trùng. Apps Script worker vẫn là nơi validation và ghi Sheet có thẩm quyền.
- Nếu worker thất bại, job giữ payload/lỗi để retry và Notification Center phải phản ánh lỗi; không được coi optimistic row là bằng chứng Sheet đã ghi thành công.
- Form nhập dầu cho phép bỏ trống `Nguồn chi`; trường này vẫn được ghi vào đúng cột hiện hữu khi người dùng có chọn.

## 6. Fluent Mica visual layer

Lớp visual thử nghiệm giữ nguyên toàn bộ layout/interaction contract và dùng phân tầng vật liệu:

- `Smoke`: backdrop tối nhẹ, blur 6px để tách form khỏi ứng dụng;
- `Acrylic`: chỉ dùng cho vỏ drawer, header và footer với độ mờ cao;
- `Mica`: gradient xanh ngọc–xanh lam rất nhẹ cho canvas;
- `Solid`: bắt buộc cho input, select, textarea, card nội dung và các trạng thái lỗi.

Không dùng iridescent gradient, chromatic aberration, blur động hoặc morphing. Hiệu ứng nhấn chỉ dùng `transform` 180ms và phải tôn trọng `prefers-reduced-motion`.

## 7. Thành tiền dầu và định nghĩa trường R7

- Thêm/sửa Dầu dùng `fuel-amount-preview.ts`: nhân số lít và giá nhập theo định dạng Việt Nam, thiếu/không hợp lệ hiện `—`; kết quả chỉ đọc, không gửi trong payload hoặc ghi đè công thức.
- Header nguồn có thẩm quyền; registry trình bày không lọc/reorder editable headers. Boolean/định danh/diễn giải không được normalize như số; header số phải được đăng ký rõ ràng. Entry dùng metadata theo key, không dựa vào text nhãn dịch.
- Checkbox Không qua Quỹ giữ semantics và handler hiện có. Datalist xe/tài xế và nhãn mã phạt vẫn giữ nguyên lựa chọn/giá trị nguồn.

- Select loại giao dịch Thu/Chi và loại trả vay chỉ có lựa chọn nghiệp vụ hiện hữu (`allowEmpty=false`); các select danh mục giữ lựa chọn trống và giá trị cũ nếu nguồn không còn trong danh mục.

## 8. Số lưu trữ và form sửa (R8 06/10; trạng thái live theo context)

- Ô số trống/null mở sửa và gửi payload vẫn trống; explicit 0 của trường cho phép 0 phải giữ 0. Không dùng formatter KPI (làm tròn) để dựng draft.
- Số lưu trữ dùng dot decimal; draft Việt Nam dùng dấu phẩy, grouping hàng nghìn. Round-trip giữ precision, gồm Danh mục.
- Riêng khối lượng Vận chuyển: bỏ trống dùng công thức sức chở × chuyến; nếu nhập phải là số hữu hạn >0. API kiểm trước enqueue và backend kiểm trước ghi; không tự đổi mọi zero lịch sử thành blank.
- Writer bỏ qua ô đang có công thức, giữ helper/validation. Regression `tests/r8-transport-remediation.test.js`; không coi unit là nghiệm thu Production.
