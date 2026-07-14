# C3 Golden Master

## Mục đích

Tài liệu này khóa nguồn chuẩn duy nhất cho C3. Mục tiêu là chuyển presentation C2 sang Next.js mà không thay đổi UI/UX, nội dung, cách định dạng dữ liệu hoặc hành vi người dùng.

## Nguồn chuẩn theo thứ tự ưu tiên

1. Production C2 đang chạy tại `https://dongbac.vercel.app`, deployment `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`.
2. Trạng thái authenticated sau khi client C2 tải xong dữ liệu và hydrate DOM.
3. Tree Git C2 `73a0ede`:
   - `index.template.html`;
   - toàn bộ `styles_*.html`;
   - toàn bộ `client_*.html`;
   - asset trong `public/static/assets/`.
4. Hai ảnh Dashboard mobile do người dùng cung cấp ngày 2026-07-14:
   - Ảnh 2 là C2 accepted golden master;
   - Ảnh 1 là candidate bị từ chối, chỉ dùng làm negative baseline.

Nếu template tĩnh khác trạng thái sau hydrate, trạng thái sau hydrate thắng. Không được suy diễn lại business number từ matrix khi C2 dùng payload KPI chuyên biệt.

## Quy tắc không được thay đổi

- Plus Jakarta Sans và toàn bộ logo/icon/SVG C2.
- Tiêu đề, eyebrow, subtitle cập nhật và source badge.
- Thứ tự menu, icon, active state, drawer desktop/mobile và bottom navigation.
- Nội dung, thứ tự, màu semantic, định dạng số/ngày/tháng của KPI.
- Loại biểu đồ, trục, nhãn, tooltip và thứ tự dữ liệu.
- Tab, filter, bảng, modal, drawer, empty/loading/error state.
- Quyền hiển thị và thao tác của admin/operator/shareholder.
- API/RBAC/workbook/year/cache/queue/source-of-truth hiện hữu.

`ui-ux-pro-max` chỉ được dùng để kiểm tra consistency, touch target, responsive, safe area, accessibility và fixed-element overlap. Mọi gợi ý đổi font, màu, style hoặc information hierarchy đều không áp dụng cho C3.

## Dashboard golden values — 07/2026

Baseline authenticated do người dùng xác nhận:

| Trường | Giá trị C2 |
| --- | ---: |
| Tháng | 07/2026 |
| Tổng doanh thu | 270.513.180 |
| Chi phí vận hành | 94.863.960 |
| Lợi nhuận gộp | 175.649.220 |
| Chi phí sau vận hành | 341.770.935 |
| Lợi nhuận thực tế | -166.121.715 |
| Chuyến gần nhất | 04/07/2026 |

Các giá trị trên phải đến từ cùng semantics với C2: `overview.kpis` được ưu tiên cho KPI theo tháng; matrix `overview.months` tiếp tục dùng cho bảng và chart theo đúng runtime C2. Không dùng `revenue - rawGross` hoặc `rawGross - rawFinal` để thay thế KPI chuyên biệt khi payload KPI tồn tại.

## Breakpoint bắt buộc

- 375×667;
- 390×844;
- 430×932;
- 768×1024;
- 1440×900.

Mỗi breakpoint phải kiểm tra: không horizontal overflow, safe-area, fixed bottom navigation không che nội dung, touch target tối thiểu 44px và đúng vị trí/geometry so với C2.

## Cổng phê duyệt

Một module chỉ đạt khi đồng thời:

1. data contract và giá trị đại diện khớp C2;
2. DOM/class/asset/interaction đã đối chiếu với runtime C2;
3. desktop/mobile visual comparison đạt;
4. test, lint, typecheck, build và diff check đạt;
5. người dùng phê duyệt trực tiếp preview của module.

Không được suy ra module khác đạt chỉ vì shell hoặc Dashboard đạt.

## Bằng chứng triển khai Dashboard C3.2a

- Next dùng nguyên bảy fragment CSS từ tree C2 `73a0ede` trong `next-shell/app/c2-golden.css`; các binding bổ sung chỉ nối React với đúng class C2.
- `next-shell/lib/platform/dashboard-c2.ts` giữ parse tháng, định dạng số đầy đủ và ưu tiên KPI hydrated theo month key.
- `tests/next-dashboard-c2-golden.test.js` dùng fixture có matrix cố tình lệch để khóa năm giá trị golden và ngăn tái diễn việc suy ra KPI sai.
- Login unauthenticated được kiểm tra tại 390×844: viewport/body 390px, card 342px, Plus Jakarta Sans, không horizontal overflow.
- Technical gates sau correction ngày 2026-07-14: 268/268 test, lint, typecheck, build, `git diff --check`; preview `https://vantaidongbac-c3-preview.vercel.app` (`dpl_6gdxkLwGnXperukyRtre3iqCTmuz`) trả HTTP 200 qua deployment-authenticated smoke. Alias preview tiếp tục có Vercel Deployment Protection.
- Computed-style QA 390×844: `document.fonts.check()` xác nhận Plus Jakarta Sans đã tải; header–table gap `0px`; export `28×28px`; SVG `16×16px`, `display:block`, stroke `rgb(100,116,139)`; document không horizontal overflow.
- Người dùng đã phê duyệt correction Dashboard ngày 2026-07-14; Login/Auth, Shell/Nav và Dashboard được khóa `USER_APPROVED` trong parity matrix.

## Bằng chứng triển khai Report C3.2b

- `next-shell/components/report/ReportModule.tsx` port DOM/class/runtime trực tiếp từ `index.template.html` và `client_reports.html` của tree `73a0ede`; không giữ visual `report-module-*` của candidate bị từ chối.
- Giữ nguyên bốn matrix backend, năm tab, tháng thực tế/`Tất cả`, tìm kiếm accent-insensitive nhiều từ chỉ trên Lương/Xe, filter công ty/biển số, subtotal động, sticky columns, colgroup Chi tiết, màu semantic và trạng thái loading/empty/error C2.
- Dùng chung dependency `html2canvas-pro@1.5.8` cho export ảnh; export Excel tiếp tục là CSV UTF-8 BOM theo C2. Nút action 28×28px/SVG 16×16px hiện trên desktop và ẩn trên mobile đúng media rule C2.
- Technical gate ngày 2026-07-14: 270/270 test, lint, typecheck, build và `git diff --check` đạt. Computed style 390px xác nhận body/card đúng chiều rộng, tab gap 4px, header–table margin 0 và action ẩn; 1440px xác nhận Plus Jakarta Sans, tab gap 8px, filter margin 16px, action 28×28px/SVG 16×16px có stroke.
- Preview `https://vantaidongbac-c3-preview.vercel.app` trỏ `dpl_7ngtXhSgmejtggAh11TNthLUpn4T` (READY). Deployment dùng Production environment để nhận đầy đủ biến server `sensitive`, nhưng được tạo với `--skip-domain` và chỉ gán alias preview; production alias vẫn là C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`, redirect `/legacy-index.html` trả 200. Smoke preview: session không cookie trả đúng 401 thay vì 503; API health trả 200.
- Report chỉ ở `TECH_PASS`; cần người dùng duyệt authenticated visual và chức năng trước khi nâng `USER_APPROVED`.

Người dùng đã phê duyệt tiếp tục checkpoint sau khi kiểm tra Report ngày 2026-07-14; Report được nâng `USER_APPROVED`.

## Bằng chứng triển khai Manage/Entry C3.3

- Manage port trực tiếp cấu trúc C2: sáu tab sheet, quick/custom date, tìm kiếm accent-insensitive, thống kê Tài xế, filter/thống kê Xăng dầu, bảng ngang cuộn trong card, sticky column, pagination và modal sửa/xóa theo RBAC.
- Entry dùng lại `entry-shell`, `form-list`, `form-tab`, `entry-row`, `fields`, `status` và `submit-bar` C2; giữ sáu schema form, multi-row, clone/add/remove, validation, pending/error và retry.
- Sửa/xóa tiếp tục dùng contract `saveSheetRow`/`deleteSheetRow`, gửi row identity/dữ liệu trước; các cột công thức C2 không xuất hiện trong form sửa. Nhập mới tiếp tục dùng `submitRows` queue, kick worker và poll status; không đổi Sheet/schema/cột/công thức.
- Technical gate ngày 2026-07-14: 270/270 test, lint, typecheck, build và `git diff --check` đạt. Computed-style/screenshot QA ở breakpoint mobile 500px và desktop 1440px xác nhận Plus Jakarta Sans, tab gap 4/8px, filter grid/flex đúng breakpoint, document không overflow và bảng 760px cuộn bên trong card trên mobile.
- Preview `https://vantaidongbac-c3-preview.vercel.app` trỏ correction READY `dpl_4hT1vCRx88R9LeG2dn716oC6yvV2`. Deployment dùng Production environment với `--skip-domain`; production `https://dongbac.vercel.app` vẫn trỏ C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. Smoke qua Vercel protection bypass: session không cookie trả 401, API health trả 200.
- Manage/Entry ở `TECH_PASS`, chờ người dùng kiểm tra authenticated visual/chức năng trước khi nâng `USER_APPROVED`.
- Regression gate bắt buộc: mọi root dùng class `.view` C2 phải đồng thời có `.active` hoặc state hiển thị tương đương. Dữ liệu phụ như catalog Entry không được nằm trên critical render path của Manage; navigation phải có loading feedback và chỉ prefetch destination có intent, không prefetch đồng loạt.

Người dùng đã phê duyệt tiếp tục checkpoint sau correction Manage/Entry ngày 2026-07-14; hai surface được nâng `USER_APPROVED`.

## Bằng chứng triển khai Catalog C3.4

- `next-shell/components/catalog/CatalogModule.tsx` bỏ header/card/modal redesign và khôi phục trực tiếp `catalogView view active`, `sub-tabs-bar`, sticky filter, `table-card`, `report-table mobile-record-table` và modal shared của C2.
- Giữ đủ chín tab, tìm kiếm accent-insensitive, filter Nhân sự/Công ty xe, cột Công ty/Chủ xe kèm badge, 20 dòng/trang, action icon C2 và trường ngày/số/ghi chú đúng loại input.
- Hai view ảo tiếp tục đọc/ghi physical `DM_ThamSo`; xóa chỉ clear đúng nhóm cột. Effective-date/history vẫn do `CatalogService`/`SheetService` sở hữu; không đổi sheet, thứ tự cột, công thức, workbook hay source of truth.
- Test C3 khóa root `.view active`, toàn bộ ID/class C2, chín tab, mapping view ảo, RBAC và việc không tái xuất hiện các class redesign. Technical gate: 272/272 test, lint, typecheck, build và `git diff --check` đạt.
- Preview `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_HohfDxtwRWx2AfEnvLgY2qVoAew5`; API health 200 và session không cookie trả lỗi hết phiên đúng contract. Production `https://dongbac.vercel.app` vẫn là C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`.
- Browser automation chuyển tới Vercel Deployment Protection trước app nên không ghi nhận authenticated computed-style/screenshot giả. Catalog ở `TECH_PASS`, chờ người dùng kiểm tra giao diện và chức năng bằng phiên đăng nhập trước khi nâng `USER_APPROVED`.

Người dùng đã kiểm tra và phê duyệt tiếp tục migration ngày 2026-07-14. Catalog được nâng `USER_APPROVED` cho gate migration. Phản hồi đồng thời xác nhận Manage và Catalog còn nhiều UI/UX debt; khoản nợ này được hoãn sang pha thiết kế/chỉnh giao diện sau và không cho phép redesign trong các checkpoint migration còn lại.

## Bằng chứng triển khai Cashflow C3.5

- `next-shell/components/cashflow/CashflowModule.tsx` bỏ toàn bộ root/header/card/modal của candidate redesign và trở lại `cashflowView view active`, `sub-tabs-bar`, sticky toolbar, `fund-kpi-grid`, `fund-export-card`, `table-card`, bảng ngang, pagination và full-screen drawer C2.
- Tổng quan giữ sáu metric backend và báo cáo ba khối, chi tiết category/filter đối tác và export ảnh. Giao dịch giữ quick/custom date, search accent-insensitive, 20 dòng/trang, pending-job overlay, direct edit/delete và form nhiều dòng/clone/add/remove. Khoản vay giữ current reconciliation metadata, summary/history filters và ba loại trả nợ/gốc/lãi. Fund Catalog giữ năm chip và form inline; native range/bounds/clear-only vẫn do backend sở hữu.
- UI chỉ thêm binding responsive/touch/accessibility trong `c2-golden.css`; không áp dụng font, màu, hierarchy hoặc style mới từ `ui-ux-pro-max`. Không đổi Sheet, thứ tự cột, công thức, workbook hoặc source of truth.
- Technical gate ngày 2026-07-14: 272/272 test, lint, typecheck, build và `git diff --check` đạt. Test C3 khóa root `.view active`, bốn tab, report/export, filters, pagination 20, reconciliation, Fund Catalog inline, drawer C2 và cấm class redesign quay lại.
- Preview `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_DxHVCvzd8Dc1ZZnDM8BGzPcNrrRc`; session không cookie trả 401 và API health 200 qua deployment bypass. Production `https://dongbac.vercel.app` vẫn trỏ C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. Cashflow ở `TECH_PASS`, chờ người dùng kiểm tra authenticated visual/chức năng.

### Correction popup/drawer ngày 2026-07-14

- Phản hồi thực tế phát hiện `Quỹ > Danh sách thu chi > Nhập mới` mở menu trái và form Vận hành bị che/khó thao tác trên mobile. Nguyên nhân là AppShell và Cashflow cùng dùng body class `drawer-open`, cộng với các overlay nằm trong `.view` có animation `transform`, tạo stacking context giữ modal dưới navigation cố định.
- AppShell dùng riêng `shell-drawer-open`; Cashflow dùng `cashflow-modal-open`. Drawer Cashflow và popup Entry/edit của Manage được portal trực tiếp vào `document.body`, có backdrop/z-index độc lập; bottom navigation không nhận tương tác khi modal mở.
- Form Entry trong Manage trở lại hành vi full-viewport C2 trên mobile, có safe-area, header/submit bar luôn thao tác được và vùng rows cuộn độc lập. Không thay font, màu, icon, hierarchy hoặc nghiệp vụ C2.
- Regression tests khóa việc popup nghiệp vụ không kích hoạt sidebar, portal body-level, lớp z-index, full-screen mobile và safe-area submit. Gate mới đạt 274/274 test, lint, typecheck, build và `git diff --check`.
- Preview hiện trỏ READY `dpl_Dw7o14BkbLp77bNuXPZ6Q8ULctf9`; session không cookie 401, API health 200. Production vẫn là C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`. Do không có phiên đăng nhập của người dùng trong browser automation, correction vẫn chờ authenticated visual/chức năng approval.

## Gate dependency và cascade bắt buộc cho các surface tiếp theo

Phản hồi visual ngày 2026-07-14 chứng minh copy CSS/DOM chưa đủ nếu bỏ sót dependency hoặc để stylesheet khác rò rỉ vào surface golden. Từ Dashboard trở đi, mỗi surface phải thêm đủ các kiểm tra sau trước `TECH_PASS`:

1. **Asset/dependency parity**: font, icon, logo, script hỗ trợ và weight phải được tải thật trong browser; khai báo `font-family` không được coi là đã tải font.
2. **DOM wrapper parity**: giữ cả wrapper tưởng như “không cần thiết” quanh header/action/table nếu runtime C2 có, vì wrapper có thể là flex/cascade boundary.
3. **Cascade audit**: liệt kê selector dùng chung với `accounts.css`/`platform.css`; mọi property rò rỉ phải được scope hoặc reset rõ. Không chỉ so các rule trùng tên trong stylesheet C2.
4. **Computed-style gate**: đo font thực tế, margin/gap, kích thước/stroke icon và geometry card ở browser sau hydrate.
5. **Screenshot gate**: kiểm tra header nối liền body/table, icon không rỗng, font đã tải, không overflow và fixed navigation không che nội dung.

Regression cụ thể đã khóa: `.table-card > .table-wrap` phải có `margin-top: 0`; export là 28×28px với SVG 16×16px, `stroke: currentColor`; document phải tải Plus Jakarta Sans đủ weight 300–800.
