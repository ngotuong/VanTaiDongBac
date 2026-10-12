# APPEARANCE_THEME_CONTRACT

## 1. Phạm vi

Contract này triển khai phần theme/surface của `UI_DESIGN_SYSTEM_CONTRACT.md`.

Webapp hỗ trợ ba lựa chọn giao diện cho mọi vai trò: `Sáng`, `Tối` và `Theo thiết bị`.

- Lựa chọn được lưu tại `localStorage` với key `vtdb-theme-preference` và chỉ áp dụng trên thiết bị/trình duyệt hiện tại.
- `Theo thiết bị` theo dõi thay đổi của `prefers-color-scheme` trong thời gian webapp đang mở.
- Script bootstrap trong `next-shell/app/layout.jsx` phải áp dụng theme trước khi React hydrate để không lóe nền sáng khi mở Dark Mode.
- `theme-color` và `color-scheme` phải được cập nhật cùng giao diện để thanh trạng thái/PWA trên iPhone dùng màu phù hợp.

## 2. Token và độ tương phản

- Component sử dụng token semantic `--platform-bg`, `--platform-surface`, `--platform-surface-soft`, `--platform-text`, `--platform-muted`, `--platform-border`, `--platform-primary`, `--platform-danger` thay vì tự đảo màu.
- Dark Mode dùng nền xanh đen và màu teal giảm chói; không dùng phép `filter: invert()`.
- Text thường phải đạt WCAG AA 4.5:1. Trạng thái nghiệp vụ không được truyền đạt chỉ bằng màu; icon/text trạng thái hiện hành vẫn được giữ.
- Input, bảng, modal, drawer, menu, thông báo và trạng thái focus phải có nền/viền tương phản rõ ở cả hai theme.
- Mọi card nghiệp vụ, KPI, hàng bộ lọc và ô bảng đang hiển thị phải quay về token semantic ở lớp cascade cuối; quy tắc light legacy có `!important` không được thắng Dark Mode.
- Sticky column, zebra row, total row và cột tổng riêng của báo cáo phải dùng cùng họ surface tối, không được xen ô trắng/xanh nhạt trong bảng tối.
- Báo cáo Thu chi và Dữ liệu chuyến gần đây phải dùng text semantic tương phản; các màu nghiệp vụ dương/âm được ánh xạ sang biến thể sáng đủ đọc trên nền tối.
- Nút tạo dữ liệu trong Dark Mode dùng cặp token `--platform-primary` và `--platform-on-primary` đã duyệt; không giữ chữ trắng khi nền dùng teal sáng. Drawer Vận hành phải dùng token cho cả nhãn, tab, ô nhập và chữ ngày; không dùng màu light cố định trong selector có ID.

## 3. Export

- Theme chỉ thay đổi giao diện tương tác. `.table-card.is-exporting` luôn dùng token light và `color-scheme: light` để ảnh/Excel giữ quy chuẩn tài liệu đã duyệt, không phụ thuộc thiết bị đang dùng Dark Mode.

## 4. Kiểm thử

- `tests/theme-preference.test.js` khóa ba lựa chọn, persistence, system listener, bootstrap chống flash, `theme-color`, token Dark Mode, lớp surface-integrity cho card/bộ lọc/bảng/drawer và ngoại lệ export.
- Trước khi deploy phải chạy full test, lint, typecheck, build, Environment Identity Guard và `git diff --check`.

## 5. Trạng thái

- Loại tài liệu: `CURRENT` UI contract.
- Ngày xác nhận: 2026-09-25.
