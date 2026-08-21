# BUSINESS_FORM_SHEET_CONTRACT

## 1. Phạm vi

Đây là quy chuẩn giao diện cho các form ghi dữ liệu trên mobile:

- nhập mới Vận hành;
- sửa dữ liệu Vận hành;
- thêm/sửa Danh mục;
- nhập giao dịch Thu/Chi;
- nhập khoản vay và trả vay.

Các hộp xác nhận, bộ lọc và drawer chỉ đọc không thuộc contract này.

## 2. Cấu trúc chung

- Component gốc phải có thuộc tính `data-business-form-sheet`.
- Drawer neo đáy, rộng bằng viewport và cao theo nội dung; chỉ cuộn khi nội dung vượt quá `92dvh`.
- Header, vùng nội dung và hàng hành động nằm liên tiếp trong luồng layout. Không dùng `flex-grow` để tạo khoảng trống giả giữa form và footer.
- Footer theo ngay sau nội dung, có safe-area cho iOS và nút thao tác cao tối thiểu 44px.
- Từ 360px trở lên, các trường ngắn dùng lưới hai cột; dưới 360px chuyển một cột.

## 3. Typography và mật độ

- Tiêu đề drawer: 18px / 700.
- Tiêu đề nhóm hoặc dòng: 14px / 700.
- Nhãn trường: 11.5px / 600, không ép chữ hoa, không letter-spacing.
- Nội dung trường nhập: 16px / 500 để tránh Safari tự phóng to khi focus.
- Input/select/date cao 44px; textarea mặc định 64px và chỉ tăng khi nội dung cần.
- Khoảng cách trường theo trục ngang 8px, trục dọc 9px; padding card 11px.

## 4. Tương tác đóng

- Luôn có nút đóng hoặc hủy rõ ràng.
- Có thể chạm backdrop để đóng khi form cho phép.
- Có thể vuốt xuống từ handle hoặc vùng trống không tương tác khi vùng cuộn đang ở đầu trang.
- Không bắt đầu thao tác vuốt từ input, select, textarea, button, link hoặc vùng `contenteditable`.
- Nếu nội dung đã cuộn xuống, ưu tiên cuộn nội dung và không đóng drawer.
- Tôn trọng `prefers-reduced-motion`.

## 5. Nguồn thực thi

- Token và layout: `next-shell/app/platform.css`, khối `Business form sheet system`.
- Gesture: `next-shell/components/platform/useSwipeDismiss.ts`.
- Điểm gắn contract: `ManageReadOnlyModule.tsx`, `CatalogModule.tsx`, `CashflowModule.tsx`.

Module mới không được tự đặt chiều cao, font hoặc footer riêng cho form mobile nếu chưa cập nhật contract này.

## 6. Fluent Mica visual layer

Lớp visual thử nghiệm giữ nguyên toàn bộ layout/interaction contract và dùng phân tầng vật liệu:

- `Smoke`: backdrop tối nhẹ, blur 6px để tách form khỏi ứng dụng;
- `Acrylic`: chỉ dùng cho vỏ drawer, header và footer với độ mờ cao;
- `Mica`: gradient xanh ngọc–xanh lam rất nhẹ cho canvas;
- `Solid`: bắt buộc cho input, select, textarea, card nội dung và các trạng thái lỗi.

Không dùng iridescent gradient, chromatic aberration, blur động hoặc morphing. Hiệu ứng nhấn chỉ dùng `transform` 180ms và phải tôn trọng `prefers-reduced-motion`.
