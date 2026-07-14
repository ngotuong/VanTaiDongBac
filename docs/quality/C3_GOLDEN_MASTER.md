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
- Authenticated Dashboard vẫn cần người dùng kiểm tra trực tiếp; technical evidence không tự nâng trạng thái thành `USER_APPROVED`.

## Gate dependency và cascade bắt buộc cho các surface tiếp theo

Phản hồi visual ngày 2026-07-14 chứng minh copy CSS/DOM chưa đủ nếu bỏ sót dependency hoặc để stylesheet khác rò rỉ vào surface golden. Từ Dashboard trở đi, mỗi surface phải thêm đủ các kiểm tra sau trước `TECH_PASS`:

1. **Asset/dependency parity**: font, icon, logo, script hỗ trợ và weight phải được tải thật trong browser; khai báo `font-family` không được coi là đã tải font.
2. **DOM wrapper parity**: giữ cả wrapper tưởng như “không cần thiết” quanh header/action/table nếu runtime C2 có, vì wrapper có thể là flex/cascade boundary.
3. **Cascade audit**: liệt kê selector dùng chung với `accounts.css`/`platform.css`; mọi property rò rỉ phải được scope hoặc reset rõ. Không chỉ so các rule trùng tên trong stylesheet C2.
4. **Computed-style gate**: đo font thực tế, margin/gap, kích thước/stroke icon và geometry card ở browser sau hydrate.
5. **Screenshot gate**: kiểm tra header nối liền body/table, icon không rỗng, font đã tải, không overflow và fixed navigation không che nội dung.

Regression cụ thể đã khóa: `.table-card > .table-wrap` phải có `margin-top: 0`; export là 28×28px với SVG 16×16px, `stroke: currentColor`; document phải tải Plus Jakarta Sans đủ weight 300–800.
