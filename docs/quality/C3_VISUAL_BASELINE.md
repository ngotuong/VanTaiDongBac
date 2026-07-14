# C3 visual baseline

## Mục tiêu

C3 viết lại presentation C2 bằng Next.js. Đây là migration có chỉnh lỗi căn hàng/responsive nhỏ, không phải redesign.

Nguồn chuẩn là recovery C2 `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg` tại `https://dongbac.vercel.app` trong thời gian làm preview. Production không đổi alias trước khi người dùng duyệt.

## Ngôn ngữ thị giác phải giữ

- font Plus Jakarta Sans;
- nền xám rất nhạt, surface trắng, chữ slate;
- deep teal/teal là màu thương hiệu, blue/amber/red/green chỉ dùng làm accent dữ liệu;
- sidebar desktop 260px, logo 44px, navigation item cao 48px;
- desktop gutter 32px; mobile gutter 12px;
- card radius 12px cho KPI/control, 16px cho panel/table;
- bottom navigation mobile năm mục, cách cạnh 12px, cao 72px;
- bảng dữ liệu dày, cuộn ngang trong card thay vì làm vỡ viewport.

## Baseline đo trực tiếp

### Desktop 1440×900

- sidebar: `260×900`, padding `24px 16px`;
- main: rộng `1180px`, padding `32px 32px 100px`;
- topbar: rộng `1116px`, cao `79px`;
- dashboard month filter: rộng `1116px`, cao `62px`;
- KPI grid: năm cột bằng nhau, gap `12px`;
- mỗi KPI: khoảng `213.6×113`, padding `14px`, radius `12px`;
- panel/table: rộng `1116px`, radius `16px`.

### Mobile 390×844

- main: rộng `390px`, padding `16px 12px 96px`;
- topbar: rộng `366px`, gap `12px`;
- month filter: `366×62`;
- KPI grid: hai cột bằng nhau, gap `8px`;
- KPI: `179×108`, không cho nội dung làm các ô cùng hàng lệch chiều cao;
- panel/table: rộng `366px`, radius `16px`;
- bottom navigation: `366×72`, left/right/bottom `12px` và cộng safe area;
- body không có horizontal overflow; table tự cuộn trong card.

## Cải thiện được phép

- chuẩn hóa ô cùng hàng bằng nhau;
- chỉnh padding/gap về nhịp 4/8px;
- giữ touch target tối thiểu 44px trên mobile;
- sửa text/icon baseline, overflow và safe-area;
- giữ focus visible, reduced motion và contrast.

Không được đổi palette, font, navigation hierarchy, information density, card language hoặc biến dashboard thành một design system khác.

## Gate trước cut-forward

1. Preview không redirect/fallback tới legacy.
2. Đối chiếu ảnh ở 390×844, 768×1024 và 1440×900.
3. Kiểm tra Dashboard, Report, Vận hành, Danh mục, Quỹ và Cài đặt trong phiên authenticated.
4. Role/RBAC, API, Sheet, cache/queue và write semantics không đổi.
5. Người dùng xác nhận trực tiếp preview trước khi đổi production alias.

