# THU_CHI_BOUND_SCRIPT

Boundary và contract cho script gắn với Google Sheet Thu chi. Trạng thái live/checkpoint thuộc [PROJECT_CONTEXT](../../PROJECT_CONTEXT.md); candidate và bằng chứng R8 thuộc [runbook](../operations/R8_REMEDIATION.md). Source cũ trong `docs/source/thu_chi_bound_script/` là **REFERENCE SNAPSHOT — KHÔNG TỰ ĐỘNG DEPLOY**.

## 1. Mục đích và phạm vi

Phân biệt script bound phục vụ Sheet với Apps Script standalone phục vụ HTTP API/worker. Không coi snapshot là code live hoặc dùng snapshot để overwrite project chưa xác minh.

## 2. Hai Apps Script project khác nhau

| Project | Context và đường gọi |
|---|---|
| Standalone web app | Root `*.gs`, mở workbook theo ID; Vercel → API/domain → Sheets; Supabase cache/queue |
| Thu chi bound | Active workbook/sheet/cell; menu, macro, drawing, cell button, `onEdit`; không đi qua Vercel/RBAC/queue |

## 3. Ranh giới bắt buộc

Không copy backend web app vào workbook, copy bound source vào standalone với active context, gộp `BOT_USERS` với `app_users` hoặc đưa service-role/proxy secret vào bound script. Snapshot không thuộc main `clasp push`; deploy bound phải kiểm tra Script ID riêng.

## 4. Source inventory

| File | Vai trò |
|---|---|
| `appsscript.json` | Timezone, scopes, macro registrations |
| `menu.js` | Custom menu/entry points |
| `cellButtons.js` | Điều khiển edit-based dashboard |
| `macro.js` | Điều hướng, checkbox/filter |
| `onEdit.js` | Validation, ghi Thu chi/Vay, công nợ, in phiếu |
| `docso.js` | Số tiền thành chữ |
| `theme.js` | Theme/format trên dashboard |

Live pull còn có `loanAllocation.js`; không suy ra source mới này từ snapshot cũ. Lưu live pull và SHA riêng trước sửa.

## 5. Manifest snapshot

V8, Stackdriver, timezone snapshot `America/New_York`; hệ thống chính dùng `Asia/Saigon`. Không tự đổi timezone/scopes/macros. Sinh mã phải dùng timezone workbook đã xác minh; test ngày sát nửa đêm và lịch sử. Không xóa tên `homnay`, `home`, `tatcasono`, `back`, `xemtatcavay`, `a`, `myFunction*` vì macro/drawing có thể tham chiếu trực tiếp.

## 6. Execution entry points

Menu/macro/drawing gọi function tên cố định. `onEdit` và cell controls có side effect nghiệp vụ; simple trigger không được tự chuyển thành installable trigger. Drawing assignment, macro đang dùng và trigger owner cần kiểm tra trực tiếp, không đoán từ source.

## 7. Sheet dependency

`BC_THUCHI`, `BC_VAY`: dashboard/filter/form; `NHAP_THUCHI`, `NHAP_VAY`: dữ liệu; `CAIDAT`: danh mục/named ranges; `INPHIEU`: template. Không đổi tên, vị trí cột hoặc layout trong thay đổi code không có migration được duyệt.

## 8. `onEdit` — Luồng Thu chi

Validation động dựa vào active sheet/row/column/value và các ô bắt buộc. Thanh toán công nợ ở `BC_THUCHI` row ≥19: C mã, D ngày gốc, E/G mục Thu/Chi, K đối tác, O dư nợ, Q ngày trả, R tất toán, S số tiền, U nhân viên, V xác nhận.

Copy về `NHAP_THUCHI` giữ voucher nguồn, đúng ngày/category/partner/actor/amount/content; reset đúng form sau thành công. Append phải dựa vào **cột nghiệp vụ**, không `getLastRow()` bị helper ARRAYFORMULA kéo dài; tăng row capacity khi cần. Không dùng bitwise để kiểm tra tiền.

In phiếu vẫn ở Sheet: checkbox B, row ≥19; nguồn D ngày, C mã, I tiền, J:L thông tin → các ô template như E5/B10/B12/G6/G7/E10/C12/C13. Thay mapping phải test cả template và downstream; không đưa in phiếu vào web app ngoài phạm vi được duyệt.

## 9. `onEdit` — Luồng khoản vay

`BC_VAY` row ≥6: I ngày, J loại, K tất toán, L tiền, M hình thức, N xác nhận. Helper mã lấy A, fallback B; giữ mã ẩn và fallback. Trả lãi/trả nợ toàn bộ/trả một phần append đúng loại, tiền, đối tác, nội dung, mã gốc rồi reset form. Validation/background là phần contract, không bỏ khi migration.

## 10. `NHAP_VAY` positional contract

A mã, B ngày, C loại, E đối tác, F tiền, K nội dung; N là helper filter do `N2` ARRAYFORMULA sở hữu. Web/bound không ghi row formula N3:N. Thu chi cũng giữ N2 và các helper K/M/O ngoài cột nghiệp vụ của thao tác.

Xóa ngày dòng 2 không được clear N2. Cấp mã không tự sửa filter. Thiếu root phải dừng và yêu cầu migration riêng; repair chỉ clear **exact collisions đã snapshot/fingerprint**, không clear cả cột hoặc tự thay root.

## 11. `macro.js`

Điều khiển kỳ hôm nay/hôm qua/tuần/tháng/tất cả, view và active ranges; code generated vẫn có side effects. Trước xóa function phải kiểm tra manifest, menu, drawing assignments và executions.

## 12. `cellButtons.js`

Checkbox/dropdown, background và validation tạo nút edit-based dashboard. Không coi vùng điều khiển là dữ liệu và không đổi tọa độ khi chưa test cả desktop/mobile Sheets.

## 13. `theme.js`

Theme theo A1 ranges cố định trên hai dashboard. Giữ border/merge/formula/validation/number format; tránh clear/copy format diện rộng. `refreshPinterestThemeBorders()` có đổi border, không chạy mặc định trong migration dữ liệu.

## 14. `docso.js`

Giữ định dạng input, tiếng Việt và xử lý 0/âm/lẻ/thập phân nếu hỗ trợ; test hàng chục/trăm/nghìn/triệu/tỷ. Không dùng text số tiền để thay giá trị numeric nguồn.

## 15. Giao với web app Thu chi

Hai đường ghi dùng chung Sheets nhưng không chung transaction/permission enforcement. Bound không có write job hoặc web journal lifecycle; khóa Apps Script giữa hai project không tự đồng bộ. Direct edits/bound writes có thể race với worker; phải kiểm soát writers trong maintenance và đối soát exact rows khi không rõ kết quả.

Cache có thể trễ đến trigger/tick/live read. Không thêm Supabase secret vào bound để chữa consistency khi chưa duyệt thiết kế riêng.

## 16. Giao với file Vận tải

`NHAP_THUCHI` → `IMP_ThuChi`/IMPORTRANGE → `XL_LuongNhanSu`, `BC_TongQuan`, `BC_TongHopXe` → report/cache. Thay đổi có thể ảnh hưởng lương/chi phí/lợi nhuận. Không ép sync trước khi import và công thức tính xong.

## 17. Giao với Auth/RBAC

Google account, sharing và protected ranges quản trị quyền bound. Supabase Auth, shareholder allowlist, Vercel và proxy secret không bảo vệ thao tác Sheet. Web shareholder không tự biến Drive permission thành view-only; kiểm tra editors/project access/owner/menu/drawing riêng.

## 18. Giao với bot legacy

`BOT_USERS`, `BOT_MEDIA`, `BOT_LOG` cho thấy automation từng tồn tại; chưa chứng minh bot còn chạy hoặc source có đủ. Không đồng nhất bot user/log với app user/job log. Kiểm tra external writers trước migration.

## 19. Source snapshot status

Snapshot có nhóm source/layout 2026; source live có thể khác. Canonical bound project/source/timezone đã được kiểm tra trong R8, chi tiết tại context/runbook. Trigger, drawing assignment, macro sử dụng và external bot nào chưa xác minh phải giữ nhãn chưa rõ.

## 20. Quy trình xác minh production bound project

Mở đúng workbook → Extensions → Apps Script → xác minh Script ID → pull riêng → so SHA/diff → đọc manifest → kiểm tra triggers/executions/menu/drawing/external writers. Không overwrite snapshot cũ và không sửa live khi chỉ khảo sát.

## 21. Quy trình thay đổi an toàn

Backup source/workbook và exact affected cells; nêu function/range; đối chiếu web domain/downstream; test copy native Sheets; giữ validation/protection/helper roots; test luồng bị ảnh hưởng và đọc web/cache; chỉ push đúng project trong maintenance đã duyệt. Rollback source riêng và exact migration cells, không restore toàn workbook khi có giao dịch mới.

## 22. Những thay đổi rủi ro cao

Đổi cột/tên sheet/form/named range/timezone/voucher/helper; xóa function macro; thay loại trigger; mở quyền/external service; thêm Supabase writer; sync trước IMPORTRANGE. Những việc này cần kế hoạch/phê duyệt riêng nếu ngoài checkpoint hiện hành.

## 23. Điểm yếu quan sát được

Tọa độ cố định; UI và nghiệp vụ trộn; source snapshot không đủ provenance; hai đường ghi/cache eventual consistency; web RBAC không bao phủ Google Sheets. Đây không phải phê duyệt refactor toàn bộ.

## 24. Checklist khi lỗi phát sinh từ thao tác Sheet Thu chi

Xác định nguồn thao tác và thời điểm/range → executions → exact rows/voucher → formula/validation → IMP_ThuChi → timestamps/cache/live read. Không retry cả web và Sheet khi chưa biết row đã ghi.

## 25. Checklist review source bound script

Entry point/phụ thuộc/tên range; active context hợp lệ; phạm vi clear/write/append; giữ roots; dòng nguồn/fingerprint; concurrency/replay; downstream/cache; Drive/protection; source live/rollback và canary thật. Kiểm tra số tiền lớn, ngày gần ranh giới và row capacity.

## 26. Trạng thái tài liệu

CURRENT boundary/operational contract; reference source không phải current release. Cập nhật 2026-10-04. Không lưu deployment/checkpoint timeline tại đây; tra context/runbook và Git history/baseline cho chi tiết.
