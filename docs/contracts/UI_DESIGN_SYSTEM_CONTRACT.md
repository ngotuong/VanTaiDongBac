# UI_DESIGN_SYSTEM_CONTRACT

## 1. Phạm vi và quyền sở hữu

Đây là nguồn chuẩn cấp hệ thống cho giao diện Next.js của Vận tải Đông Bắc. Mọi thay đổi UI/UX phải đọc contract này trước các contract chuyên biệt.

- Theme, token và surface chi tiết: `APPEARANCE_THEME_CONTRACT.md`.
- Form ghi dữ liệu, modal và drawer: `BUSINESS_FORM_SHEET_CONTRACT.md`.
- Bảng và card trên mobile: `MOBILE_TABLE_UI_CONTRACT.md`.
- Source thực thi cuối: `next-shell/app/platform.css` và component React liên quan.

Contract này không thay đổi nghiệp vụ, quyền, API, Google Sheet, Supabase hoặc nội dung export.

## 2. Nguyên tắc bắt buộc

1. Dùng token semantic cho nền, chữ, viền, focus, trạng thái và bóng đổ. Không thêm nền sáng literal vào surface tương tác.
2. Một loại component chỉ có một contract định vị cuối. Không đồng thời neo drawer ở đáy rồi đặt lại bằng `left: 50%` và `transform` trong lớp khác.
3. Container overlay sở hữu việc căn giữa viewport; surface chỉ sở hữu kích thước, cuộn nội dung và chuyển động đóng theo trục dọc.
4. Mật độ dùng nhịp `4/8/12/16/24px`. Control chạm tối thiểu `44×44px`; không tạo khoảng trống lớn để đạt vùng chạm. Nút đóng phải có width/height/min-width/min-height bằng 44px, không co trong flex, bo góc 12px; nút icon trong thanh thao tác dùng bo góc 10px. Đo kích thước thực trên cả mobile và desktop, không chỉ kiểm tra min-height.
5. Giao diện phải dùng được ở `360`, `390`, `430`, `768`, `1024`, `1280` và `1440px`, cả Sáng và Tối.
6. Nội dung không được tràn trang theo chiều ngang. Tab và bảng rộng phải có vùng cuộn chủ động, affordance và tự đưa trạng thái active vào vùng nhìn thấy.
7. Mọi tương tác phải có focus-visible, accessible name và dùng được bằng bàn phím. Tab dùng roving `tabIndex`, Arrow, Home và End.
8. `prefers-reduced-motion` phải được tôn trọng. Animation không được quyết định vị trí cuối của form.
9. Export là ngoại lệ light có scope `.is-exporting`; ngoại lệ không được rò sang UI đang tương tác.

## 3. Token và surface

Token nền tảng bắt buộc gồm:

- `--platform-bg` cho canvas ứng dụng;
- `--platform-surface` cho card, modal, input và bảng;
- `--platform-surface-soft` cho header, toolbar, zebra và nhóm phụ;
- `--platform-text`, `--platform-muted` cho chữ;
- `--platform-border`, `--platform-focus` cho ranh giới và focus;
- `--platform-primary`, `--platform-danger`, `--platform-accent` cho hành động và trạng thái.

Khai báo `background-color` không xóa `background-image`. Khi chuyển một surface gradient legacy sang Dark Mode phải đặt cả `background-image: none` hoặc thay toàn bộ `background` bằng token/gradient dark đã duyệt.

## 4. Component primitives

### Overlay và business form

- Overlay fixed phủ viewport và căn giữa surface.
- Desktop rộng tối đa `920px`; mobile chừa gutter `10px` mỗi bên.
- Surface không dùng phép dịch ngang để căn giữa.
- Ma trận responsive của form dùng hai cột ở `320/360/390/430px` cho trường ngắn có `data-mobile-span="half"`; trường dài hoặc chưa khai báo metadata chiếm toàn hàng. Từ `561px` giữ hai cột desktop. Cùng component, thứ tự trường và validation trên desktop/mobile; không dùng grid dense/reorder.
- Header/handle là nơi duy nhất bắt swipe-down; nội dung cuộn không được kích hoạt đóng.
- Footer theo ngay nội dung, có safe area và không tạo khoảng trống giả.

### Tab strip

- Desktop chỉ dùng grid khi toàn bộ tab vừa trong chiều rộng khả dụng.
- Ở chiều rộng trung gian/mobile, tab dùng một hàng cuộn ngang; mỗi tab giữ nguyên nhãn và vùng chạm.
- Tab active luôn được `scrollIntoView({ inline: 'nearest' })`.
- Dùng `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-controls`, `aria-labelledby` và roving `tabIndex`.

### Form và bảng

- Input/select/date: cao `44px`, nội dung `16px` trên mobile.
- Hàng bảng mobile mục tiêu `44–48px`; icon có thể nhỏ hơn nhưng hit area vẫn `44px`.
- Form ngắn ưu tiên hai cột khi đủ rộng; trường nội dung dài chiếm toàn hàng.
- Nhãn ngày tùy biến và input date native không được cùng hiển thị; native input chỉ sở hữu tương tác và accessible name.
- Empty/loading/error không được dùng spacing của hàng dữ liệu thường.

## 5. Dark Mode và accessibility

- Không có card, toolbar, modal, input hoặc table cell màu trắng trong Dark Mode, trừ `.is-exporting`.
- Text thường đạt WCAG AA; trạng thái không chỉ dựa vào màu.
- Focus ring phải nhìn rõ trên cả hai theme.
- Không vô hiệu hóa pinch zoom. Input mobile phải có computed font size tối thiểu `16px` để tránh Safari tự phóng viewport.

## 6. Quy trình cho Coding Agent

Trước khi sửa UI:

1. Xác định primitive hiện có và contract chuyên biệt liên quan.
2. Kiểm tra đủ selector ở mọi stylesheet được import; không chỉ thêm một lớp `!important` mới để che lỗi.
3. Ghi rõ ma trận viewport/theme/role cần xác minh.

Trước khi kết thúc checkpoint:

1. Chạy targeted regression, full test, lint, typecheck, build, Identity Guard và `git diff --check`.
2. Kiểm tra trực quan Preview ở light/dark trên mobile và desktop.
3. Với form ghi dữ liệu, chỉ mở/đóng và kiểm tra validation nếu checkpoint không cho phép tạo dữ liệu thử.
4. Ghi lại giới hạn QA và mốc rollback trong `PROJECT_CONTEXT.md`.

## 7. Trạng thái

- Loại: `CURRENT` UI contract.
- Owner: quy chuẩn thiết kế chung và routing tới contract chuyên biệt.
- Ngày xác nhận: 2026-09-29.

## 8. R7 — bộ component và tích hợp form

- Trang `/design-system` dùng các primitive thật trong `BusinessPrimitives.tsx` và CSS Module `business-primitives.module.css`; kế thừa semantic tokens và theme của ứng dụng, không dựng thư viện/brand thứ hai.
- Bảy primitive: Button, Badge, FieldControl/Input, Card, ListRow, ModalContent và EmptyState. `ModalContent` chỉ sở hữu header/body/footer; host phải sở hữu portal, định vị, role dialog, focus trap, dirty guard và dismiss. Không coi khung mẫu tĩnh là một dialog đang mở.
- Schema mẫu trong `business-form-schema.ts` là trình bày; schema vật lý Google Sheet vẫn có thẩm quyền. Dự án + Số km chia một hàng; Từ ngày + Đến ngày chia một hàng; ghi chú toàn hàng. Quy tắc R6 mặc định tên Dự án toàn hàng không được đưa vào bộ R7. Người dùng yêu cầu tiếp tục checkpoint sau bản component; Catalog và Manage bind trực tiếp toàn bộ editable header live, Entry dùng metadata theo key, các form Quỹ dùng cùng FieldControl/Grid/Button. Không dựng hai form riêng theo viewport.
- `BusinessAmountSummary` hiển thị kết quả chỉ đọc. Với dầu, số lít × giá dầu chỉ diễn giải thành tiền dầu, không xác nhận thanh toán hoặc phát sinh chi Quỹ. Không gửi cột công thức trong payload. Thiếu/không hợp lệ hiển thị `—`; làm tròn chỉ ở presenter.
- Trang mẫu không có write handler/API. Đổi theme dùng điều khiển hệ thống hiện có và lưu theo thiết bị; dữ liệu mẫu chỉ ở React state.
- Ma trận mốc 1: 320/360/390/430/768/1024/1280/1440px, light/dark, nhãn dài, số thập phân Việt Nam, trạng thái khóa/lỗi/focus/loading; chỉ ghi PASS khi thực sự xác minh. R7 chỉ hoàn tất khi inventory form đã được kiểm tra trên Preview. Thiết bị iPhone/Safari thật cần được ghi rõ nếu chưa kiểm tra.
