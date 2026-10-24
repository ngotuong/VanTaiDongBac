# MOBILE_TABLE_UI_CONTRACT

## 1. Mục đích và phạm vi

Contract này triển khai mật độ bảng của `UI_DESIGN_SYSTEM_CONTRACT.md`.

Đây là quy chuẩn giao diện cho các bảng dữ liệu và dòng tiêu đề card trên mobile trong Next.js web app.

Phạm vi hiện hành gồm:

- Tổng quan;
- Báo cáo;
- Vận hành;
- Danh mục;
- Quỹ;
- bảng quản lý tài khoản trong Cài đặt.

## 2. Nguồn triển khai

Các token chuẩn nằm trong `next-shell/app/platform.css`:

- `--platform-card-head-control-height`;
- `--platform-mobile-card-head-height`;
- `--platform-mobile-card-head-padding`;
- `--platform-mobile-table-head-padding`;
- `--platform-mobile-table-cell-padding`;
- `--platform-mobile-table-head-font-size`;
- `--platform-mobile-table-cell-font-size`;
- `--platform-mobile-table-head-line-height`;
- `--platform-mobile-table-cell-line-height`.

Module mới không được tự đặt padding, font-size, line-height hoặc min-height riêng cho hàng bảng mobile nếu chưa cập nhật contract và regression test này.

## 3. Dòng tiêu đề card

- Ở viewport tối đa `768px`, dòng `.table-card-head` dùng chiều cao tối thiểu `40px` và padding `4px 10px`.
- Nội dung luôn căn giữa theo trục dọc; tiêu đề và nhóm hành động không được đè lên nhau.
- Control đặt trực tiếp trong header phải gắn `data-card-head-controls`, dùng chung token chiều cao và căn giữa theo cùng trục với `.table-title`; không viết offset riêng theo module.
- `40px` là chiều cao chuẩn tối thiểu. Nội dung dài hoặc control cần thiết được phép làm dòng cao hơn để không cắt chữ và vẫn hỗ trợ Dynamic Type.
- Card clone dùng để xuất ảnh không áp dụng mật độ mobile; ảnh xuất giữ header `48px` hiện hành.

## 3.1. Hàng bộ lọc dưới tiêu đề

- Trên mobile, bộ lọc của bảng nằm trong `.table-card-subhead`, tách khỏi dòng tiêu đề và nút xuất.
- Một bộ lọc phải chiếm toàn bộ chiều rộng khả dụng; hai bộ lọc phải chia đều hai cột `1fr/1fr`. Không dùng `max-content`, `fit-content` hoặc chiều rộng nội tại tạo khoảng trống lệch trong hàng.
- `label` và `select` bên trong phải rộng `100%`, `min-width: 0`; tên lựa chọn dài được trình duyệt cắt trong đúng ô, không làm tràn card.
- Quy tắc nằm ở shared density layer, áp dụng cho mọi bảng hiện tại và bảng mới dùng `.table-card-subhead`; không viết lại selector riêng theo module.
- Vùng chạm của control vẫn tối thiểu 44px và khoảng cách giữa hai control dùng nhịp 8px hiện hành.

## 4. Hàng bảng

- Header bảng: padding `6px 8px`, font `11px`, line-height `1.2`; nhãn cột được phép xuống tối đa các dòng ngắn thay vì ép bảng rộng chỉ vì tiêu đề.
- Ô dữ liệu: padding `6px 8px`, font `13px`, line-height `1.25`.
- Ô có `colspan` dùng layout riêng cho empty/loading message và không bị ép mật độ.
- Bảng rộng được cuộn ngang trong wrapper chủ động; không làm tràn toàn trang.
- Cột nội dung/ghi chú dài giữ chiều rộng đọc tự nhiên và không được ép hẹp đến mức chữ xếp dọc làm tăng chiều cao hàng. Bảng rộng tiếp tục cuộn ngang trong wrapper chủ động.
- Số liệu dùng tabular figures khi component hỗ trợ.

## 5. Nút thao tác

- Nút icon-only phải dùng SVG cùng ngôn ngữ nét với hệ thống.
- Bắt buộc có `aria-label` và `title` mô tả hành động.
- Vùng chạm tối thiểu giữ `44×44px`, kể cả khi hàng dữ liệu được thu gọn.
- Ô thao tác được phép bỏ padding dọc để không cộng thêm chiều cao ngoài vùng chạm 44px.
- Action `Xem giải trình` của Bảng Lương nằm ở cột thao tác cuối bảng, dùng icon mắt hiển thị 24×24px trong cột 40px; pseudo hit-area mở vùng chạm thực tế lên 44×44px. Action không xuất hiện ở dòng tổng và bị loại khỏi ảnh/CSV bằng `data-export-hidden`. Cột Ghi chú ngay trước đó không bị ép hẹp hoặc wrap từng từ.
- Action `Xem chi tiết` tại các card khoản thu/chi của Quỹ cũng dùng icon mắt 24×24px, ô action không có padding dọc và pseudo hit-area mở vùng chạm lên 44×44px. Không dùng nút 44px cộng thêm padding của ô vì sẽ làm riêng bảng này cao hơn quy chuẩn.
- Trạng thái `Đã khớp` trong các bảng giải trình dùng vòng tròn tick xanh 20×20px, bắt buộc giữ `aria-label`/`title`; trạng thái lỗi vẫn phải có text, không được chỉ dựa vào màu.

## 6. Ngoại lệ

- `.table-card.is-exporting` không nhận density mobile để ảnh PNG/CSV không đổi theo viewport thiết bị.
- Form, drawer và modal tuân theo `docs/contracts/BUSINESS_FORM_SHEET_CONTRACT.md`, không thuộc contract bảng này.
- Ngoại lệ mới phải có lý do trong source, selector scope hẹp và regression test tương ứng.

## 7. Kiểm thử bắt buộc

`tests/mobile-table-density.test.js` phải khóa:

- đủ toàn bộ surface có bảng;
- việc sử dụng token thay vì số đo rời rạc;
- header card mobile và ngoại lệ export;
- contract căn giữa `data-card-head-controls` cho mọi filter nằm cạnh tiêu đề;
- contract `.table-card-subhead`: một control full-width, hai control chia đều và child control giãn kín ô;
- vùng chạm 44px;
- nút icon-only có accessible name.
- cột Giải trình nằm cuối bảng, cột action rộng 40px và cột ghi chú không bị ép hẹp làm tăng chiều cao hàng.

Trước khi deploy cần chạy targeted test, full test, lint, typecheck, Next build, Environment Identity Guard và `git diff --check`.

## 8. Trạng thái tài liệu

- Loại tài liệu: `CURRENT` UI contract.
- Phạm vi: bảng dữ liệu và dòng tiêu đề card trên mobile của Next.js web app.
- Nguồn kiểm chứng: `next-shell/app/platform.css`, các component module và `tests/mobile-table-density.test.js`.
- Ngày xác nhận gần nhất: 2026-09-25.
- Cần cập nhật khi: thêm surface có bảng, thay breakpoint, density token, kích thước vùng chạm, header card hoặc luồng export.
