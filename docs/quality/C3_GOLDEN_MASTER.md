# C3 Golden Master

## Mục đích

Tài liệu này khóa nguồn chuẩn duy nhất cho C3. Mục tiêu là chuyển presentation C2 sang Next.js mà không thay đổi UI/UX, nội dung, cách định dạng dữ liệu hoặc hành vi người dùng.

## Nguồn chuẩn theo thứ tự ưu tiên

1. Deployment C2 recovery bất biến `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`, là presentation production tại thời điểm khóa golden source và vẫn được giữ để rollback.
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

### Correction Entry C2 lần hai ngày 2026-07-14

- Người dùng xác nhận popup đã mở nhưng từ chối correction trên vì hình thức xấu, không vuốt dọc được và icon lộn xộn. Correction `dpl_Dw7o14BkbLp77bNuXPZ6Q8ULctf9` không còn hiệu lực visual.
- Đối chiếu trực tiếp `index.template.html`, `client_entry.html` và `styles_responsive.html` tại golden tree `73a0ede`: React Entry phục hồi ID `rows`, `submitBtn`, `cloneBtn`, `addBtn`, `closeMobileEntryBtn`; bốn action dùng lại path/line/rect SVG C2, không dùng glyph font `▣`, `＋`, `×`.
- Nút Đóng trở lại cùng submit bar thay vì floating circle. Trên mobile, `#rows` là vùng `overflow-y:auto`, `touch-action:pan-y`, `-webkit-overflow-scrolling:touch` duy nhất; tab form cuộn ngang riêng, submit bar giữ safe-area. Job panel phụ được ẩn trong entry sheet như C2 để không tạo grid row/nested-scroll ngoài ý muốn.
- Gate đạt 274/274 test, lint, typecheck, build và diff check. Preview hiện trỏ READY `dpl_CnvssuGUQgLED2YCEQMYG9t2bhAQ`; production vẫn C2 recovery. Không có authenticated browser session nên cần người dùng xác nhận thao tác vuốt và visual thực tế.

### Correction overlay toàn diện ngày 2026-07-14

- Phản hồi sau Entry correction xác nhận popup Quỹ vẫn không vuốt được. Audit repo-wide tìm thấy toàn bộ overlay nghiệp vụ cần khóa cùng contract: bốn Cashflow drawer, Manage Entry/edit và Catalog add/edit; không có business dialog Next khác ngoài các nhóm này.
- Cashflow drawer body là vùng pan-y duy nhất; các `.table-wrap` con chỉ cuộn ngang và để chiều dọc cho drawer. Header/footer là flex item không co, footer chừa safe-area và bottom navigation bị vô hiệu khi drawer mở.
- Manage/Catalog modal dùng portal `document.body`, modal body là vùng pan-y duy nhất có `overscroll-behavior` và iOS momentum. Catalog thêm body state riêng để khóa trang nền/navigation. Mobile dùng toàn chiều cao khả dụng và nút tối thiểu 44px; desktop vẫn giữ modal/drawer nổi C2 vì rule `100dvh` chỉ nằm trong media query mobile.
- `tests/next-overlay-interactions-c3.test.js` khóa inventory portal, scroll marker, single-scroll contract và safe-area cho mọi nhóm trên. Gate đạt 277/277 test, lint, typecheck, build và diff check.
- Preview hiện trỏ READY `dpl_Fi2JXxP4kJPbYBaNvZkZ1i1ktUX3`; deployment-authenticated root 200, session không cookie 401, API health 200. Vercel Deployment Protection chặn browser automation trước app, nên người dùng vẫn là gate cho thao tác vuốt authenticated. Production vẫn là C2 recovery.

### Correction Cashflow scroll cascade ngày 2026-07-15

- Người dùng kiểm tra authenticated trên iPhone và xác nhận form thêm giao dịch của candidate trước vẫn không vuốt tới nút Lưu; vì vậy tuyên bố scroll correction trước không đạt acceptance.
- Audit cascade tìm thấy `.cashflow-c2 {display:block}` trong React bindings có cùng class với drawer và nằm sau `.fund-detail-drawer {display:flex}` của golden CSS. Drawer thực tế trở thành block container; `.cashflow-drawer-body` có `overflow-y:auto` nhưng không có chiều cao hữu hạn và toàn bộ phần dư bị parent `overflow:hidden` cắt bỏ.
- Scope block display được thu hẹp thành `#cashflowView.cashflow-c2`. Body-level drawer được khóa `display:flex; flex-direction:column; min-height:0`; scroll body dùng `flex:1 1 0%`, `height:0`, `min-height:0`, `overflow-y:auto`, `touch-action:pan-y` và iOS momentum. Header/footer tiếp tục không co và footer giữ safe-area.
- Regression tests vừa khóa selector/cascade vừa giữ portal, z-index và single-scroll contract. Gate đạt 277/277 test, lint, typecheck, build và diff check. Preview trỏ READY `dpl_CSAZkHAftQEB6xyNGJzjMRGpNXRL`; root 200, session 401, health 200. Production vẫn C2 recovery; cần user retest trước khi C3.5 được duyệt.

Người dùng đã retest và xác nhận form Cashflow vuốt được ngày 2026-07-15; C3.5 được khóa `USER_APPROVED`.

## Bằng chứng triển khai Settings/Observability C3.6

- Golden source là `index.template.html`, `client_accounts.html`, `client_observability.html` và `styles_settings_modal.html` tại tree `73a0ede`. React giữ root `#settingsView.view.active`, `.settings-grid`, card/form/table account, từng password toggle, temporary password và toàn bộ ID C2; Observability giữ một sync card, năm button ID, path SVG C2 và bốn section cache/queue/manage audit/report audit.
- Không dùng lại presentation `b7-*`. Phần binding chỉ scope route link và grid span trong `c2-golden.css`; font, màu, radius, shadow, spacing, table scroll và breakpoint tiếp tục do golden CSS sở hữu. UI/UX review chỉ dùng để kiểm tra touch target, responsive và trạng thái tải, không redesign.
- Contract không đổi: mọi user active có thể đổi mật khẩu; list/create/update/reset account chỉ admin; temporary password chỉ giữ trong React state. Admin/operator được xem status; shareholder bị chặn ở UI và server. Initial load chỉ gọi `getSupabaseSyncStatus` và `getRecentWriteJobs`; quick 50/deep 500/all/report audit và `retryWriteJob` chỉ chạy sau thao tác chủ động; không gọi worker.
- Regression test khóa ID/class/SVG C2, responsive form/table/status rows, cấm `b7-*`, giữ role gate và heavy-action contract. Gate đạt 278/278 test, lint, typecheck, build và diff check.
- Preview `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_4W8Dyj2DE6WjUXoojmVmC2dugeee`; deployment-authenticated root 200, session không cookie 401, API health 200. Browser automation vẫn bị Vercel Deployment Protection chặn trước app nên không tuyên bố authenticated visual pass. Production tiếp tục C2 recovery `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`; C3.6 chờ người dùng duyệt.

Người dùng phê duyệt Settings/Observability và cho phép chuyển checkpoint ngày 2026-07-15; C3.6 cùng toàn bộ parity matrix được khóa `USER_APPROVED`. Trước cut-forward đã chạy lại 278/278 test, lint, typecheck, build và diff check. Alias `https://dongbac.vercel.app` sau đó được gán sang chính deployment đã duyệt `dpl_4W8Dyj2DE6WjUXoojmVmC2dugeee`, không rebuild hoặc đổi code giữa preview và production. Smoke read-only xác nhận tám route chính, favicon và `/manifest.json` trả 200; `/api/session` không cookie trả 401, `/api/app?action=health` trả 200 và không có log 5xx sau smoke. Recovery C2 vẫn READY và chưa xóa legacy/D1.

## Correction Report sau cut-forward ngày 2026-07-15

- Người dùng phát hiện ba regression sau cut-forward: Báo cáo chi tiết mất ba dòng tổng/profit, mobile hiển thị empty state cho các bảng và chuyển menu/load Report chậm hơn C2. Vì Report là nghiệp vụ chính, production được rollback ngay về C2 recovery trước khi sửa candidate; D1 tiếp tục khóa.
- Root cause trực tiếp của dòng mất là React dùng `isTotalRow()` để loại total/profit khỏi mọi matrix trước render. C2 chỉ loại chúng khi tự tính subtotal cho finance/payroll/vehicles; detail phải render nguyên matrix nguồn. `reportSourceRows()` mới khóa khác biệt này bằng test chứa đúng `Tổng khối lượng`, `Tổng doanh thu` và `Lợi nhuận thực`.
- Alias `latest` trước đây lấy row Supabase được sync gần nhất, kể cả snapshot Dashboard `__dashboard_latest__`, một tháng khác hoặc `Tất cả`, trong khi UI chọn tháng nghiệp vụ cuối từ overview. Server correction loại snapshot Dashboard khỏi Report lookup, xác thực trước, suy ra tháng nghiệp vụ mới nhất từ matrix tháng rồi đọc đúng bundle `report_month`; cache thiếu matrix tháng mới fallback Apps Script. Filter công ty/biển số không còn được áp dụng nếu option không tồn tại trong matrix mới.
- Tối ưu không đổi nghĩa dữ liệu: auth lookup được memoize trong cùng server request; Report đọc cache workbook-scoped trực tiếp sau auth thay vì thêm một vòng HTTP qua proxy; intent-prefetch được dedupe giữa pointer/focus. Không bật prefetch hàng loạt và không tuyên bố Next tự động nhanh hơn SPA C2 vốn giữ dữ liệu trong memory.
- Candidate correction `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`. Gate đạt 282/282 test, lint, typecheck, build, diff check; deployment-authenticated root 200, session không cookie 401, health 200. Production vẫn C2 `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg`; cần người dùng kiểm tra desktop/mobile Report và cảm nhận chuyển menu trước khi cut-forward lại.
- Người dùng phê duyệt correction và cho phép chuyển checkpoint ngày 2026-07-15. Report được khóa lại `USER_APPROVED`; gate chạy lại tiếp tục đạt 282/282 test, lint, typecheck, build và diff check. Alias production được gán sang chính deployment bất biến `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`, không rebuild giữa preview và production. Smoke read-only root, Dashboard, Report, Manage, Catalog, Cashflow, Settings, Observability, favicon và manifest đạt 200; session không cookie 401, health 200, không có log 5xx. C2 recovery vẫn READY; C3 bước vào production stabilization và D1 tiếp tục blocked.

## Correction interaction feedback sau cut-forward ngày 2026-07-15

- Người dùng ghi nhận chuyển menu chưa mượt và không có toast cho thao tác. Phần correction không đổi font, màu, icon, layout hay information hierarchy C2; chỉ bổ sung trạng thái phản hồi và accessibility.
- `AppShell` sở hữu một navigation transaction: item đích active/pending ngay khi chạm, drawer đóng ngay, progress 3px hiển thị trong lúc route đổi và status text dùng `aria-live`. Prefetch vẫn theo intent và được dedupe; `pointerdown` bổ sung cho mobile, không prefetch hàng loạt các route server/data nặng.
- Một `ToastViewport` toàn cục dùng lại `.sync-toast` C2. Refresh, export ảnh/CSV, CRUD Manage/Catalog/Cashflow, Entry queue/retry, account action và observability audit đều phát loading/success/error; toast thường tự đóng, có nút đóng, error dùng `role=alert`, loading không tự biến mất giữa thao tác. `prefers-reduced-motion` tắt animation progress.
- Candidate `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_9HKgcJQZoZJcj1co5xd8sTdemFKq`. Gate đạt 283/283 test, lint, typecheck và build; deployment-authenticated smoke: root 200, session không cookie 401, health 200, manifest 200. Production vẫn trỏ `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`; Shell/Nav là `TECH_PASS` và cần user retest authenticated trước promote.

### Correction progress và bottom navigation ngày 2026-07-16

- User retest cho thấy progress của candidate không kết thúc và item active bị làm nhạt. `next.config.mjs` dùng `trailingSlash:true`, nhưng AppShell so sánh raw `/dashboard` với `/dashboard/`; pending vì thế tồn tại vĩnh viễn và thuộc tính `disabled` kích hoạt opacity 0.5 của golden CSS. Route path nay được normalize trước mọi current/pending/alias comparison; timeout 12 giây chỉ là fail-safe nếu navigation lỗi. Bottom item pending dùng `aria-busy`/`aria-disabled` nhưng không dùng native disabled nên màu `var(--deep)` C2 không bị đổi.
- C2 `client_ui.html` dùng accumulated delta 15px: cuộn xuống sau 80px thì ẩn, cuộn lên thì hiện, gần cuối trang ẩn và gần đầu trang hiện. React port lại đúng bốn rule, passive scroll listener và gom DOM read bằng `requestAnimationFrame`; class tiếp tục là `.nav-hidden` và transition C2.
- Theo phản hồi khoảng hở, bottom offset được hạ từ `12px + safe-area` xuống `max(4px, safe-area)`: sát đáy hơn nhưng không lấn home indicator/system gesture. Đây là correction được người dùng yêu cầu, không áp dụng thay đổi style khác.
- Candidate hiện tại `https://vantaidongbac-c3-preview.vercel.app` trỏ READY `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`. Gate đạt 284/284 test, lint, typecheck và build; root 200, session không cookie 401, health 200. Production giữ `dpl_FLv6skataBjSHC2SFjTUaRTgbqd5`; chờ authenticated mobile user retest.
- Authenticated mobile/desktop retest ngày 2026-07-16 xác nhận route progress kết thúc, active nav không disabled/nhạt, bottom nav tự ẩn/hiện đúng hướng cuộn, nằm sát safe-area và toast refresh chuyển loading sang success rồi tự ẩn. Người dùng phê duyệt; Shell/Nav trở lại `USER_APPROVED`. Alias production được gán sang chính deployment bất biến `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`, không rebuild. Smoke read-only các route chính, favicon và `/manifest.json` đạt 200; session không cookie 401, health 200, không có HTTP 500. Warning `DEP0169 url.parse()` đã biết vẫn có thể xuất hiện trên request 200. C3 tiếp tục production stabilization và D1 vẫn blocked.
- Authenticated production stabilization retest sau cut-forward tiếp tục đạt ngày 2026-07-16; người dùng chấp thuận đóng C3 và mở checkpoint D1 riêng. Toàn bộ parity matrix giữ `USER_APPROVED`; các deployment correction và C2 recovery tiếp tục retention để rollback.

## Gate dependency và cascade bắt buộc cho các surface tiếp theo

Phản hồi visual ngày 2026-07-14 chứng minh copy CSS/DOM chưa đủ nếu bỏ sót dependency hoặc để stylesheet khác rò rỉ vào surface golden. Từ Dashboard trở đi, mỗi surface phải thêm đủ các kiểm tra sau trước `TECH_PASS`:

1. **Asset/dependency parity**: font, icon, logo, script hỗ trợ và weight phải được tải thật trong browser; khai báo `font-family` không được coi là đã tải font.
2. **DOM wrapper parity**: giữ cả wrapper tưởng như “không cần thiết” quanh header/action/table nếu runtime C2 có, vì wrapper có thể là flex/cascade boundary.
3. **Cascade audit**: liệt kê selector dùng chung với `accounts.css`/`platform.css`; mọi property rò rỉ phải được scope hoặc reset rõ. Không chỉ so các rule trùng tên trong stylesheet C2.
4. **Computed-style gate**: đo font thực tế, margin/gap, kích thước/stroke icon và geometry card ở browser sau hydrate.
5. **Screenshot gate**: kiểm tra header nối liền body/table, icon không rỗng, font đã tải, không overflow và fixed navigation không che nội dung.

Regression cụ thể đã khóa: `.table-card > .table-wrap` phải có `margin-top: 0`; export là 28×28px với SVG 16×16px, `stroke: currentColor`; document phải tải Plus Jakarta Sans đủ weight 300–800.
