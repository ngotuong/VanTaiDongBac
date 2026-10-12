# PAYROLL_EXPLANATION_CONTRACT

## 1. Mục đích và giới hạn

Giải trình lương giúp quản lý trả lời vì sao một nhân sự có mức lương/thực nhận như trên `BC_BangLuong`, đặc biệt khi cùng tháng có cả `1_LAI` và `NHIEU_LAI`.

Contract này chỉ tạo lớp **bằng chứng đọc và đối chiếu**:

- `BC_BangLuong` là kết quả cuối cùng có thẩm quyền;
- Google Sheets và công thức hiện hữu tiếp tục là source of truth;
- webapp không tự tính lại hoặc ghi ngược lương vào workbook;
- không thêm sheet, cột, named range hoặc công thức;
- sai lệch phải chuyển thành `needs_review`, không tự bù hoặc đoán.

## 2. Nguồn dữ liệu

| Nguồn | Vai trò |
| --- | --- |
| `BC_BangLuong` | Dòng lương cuối cùng cần giải thích |
| `XL_LuongNhanSu` | Thành phần lương nhân sự đã được workbook xử lý |
| `XL_LuongTheoXe` | Output lương chuyến theo xe; schema hiện hành có thể gộp cả hai kiểu ngày thành một dòng `HỖN_HỢP` với `Đơn giá` rỗng |
| `NL_ChamCong` | Nguồn nghỉ phép/ngày công chính thức |
| `NL_NghiVanHanh` | Chỉ là nguồn điều chỉnh KPI/chỉ tiêu vận hành gián tiếp qua `XL_LuongTheoXe` |
| `XL_ThuongQuanLy` | Bằng chứng thưởng tuyển lái và các mốc KPI quản lý theo từng xe/tháng |
| `DM_ThuongQuanLy` | Mã, điều kiện, mức thưởng và khoảng hiệu lực của quy tắc quản lý/tuyển dụng |
| `DM_NhanSu` | Người tuyển, nhân sự được tuyển, ngày vào và khoảng `Tính thưởng`–`Dừng thưởng` |

`NL_NghiVanHanh` tuyệt đối không được chuyển thành nghỉ phép nhân sự. Các khoản thưởng, ứng, phạt, BHXH và số dư được giải thích bằng output đã xử lý trong `XL_LuongNhanSu`/`BC_BangLuong`; checkpoint này không sao chép lại công thức từ `IMP_ThuChi`, `NL_Phat`, `DM_BaoHiem` hoặc `NL_SoDuLuong`.

Live audit ngày 23/09/2026: `BC_BangLuong`/`XL_LuongNhanSu` dùng header `Lương cứng / khoán`; `XL_LuongTheoXe` dùng `Tổng xe`, `Số lái tháng`, `Trừ KPI`, `KPI sau nghỉ`, `Lương chuyến thực`. Parser phải nhận alias theo header, không dựa vào vị trí cột. Với dòng `HỖN_HỢP`, `Đơn giá` rỗng có nghĩa đơn giá phụ thuộc từng ngày, không phải 0. Step D-A đã chứng minh phép tách theo ngày bằng `NL_TaiXe`, `SYS_AggTaiXeNgay` và `DM_LuongChuyen`; Step D-B đưa bằng chứng này vào read model server-only và vẫn đối chiếu về output tháng có thẩm quyền.

## 3. Khóa và trạng thái

Bundle Supabase dùng khóa:

```text
(spreadsheet_id, report_month, employee_key)
```

- `report_month`: bắt buộc `MM/YYYY`;
- `employee_key`: khóa chuẩn hóa từ tên nhân sự; nếu hai tên khác nhau va chạm cùng khóa, cả bundle liên quan phải `needs_review`;
- `source_data_version`: version report hiện hành;
- `source_hash`: SHA-256 của payload bằng chứng đã chuẩn hóa;
- `is_current`: chỉ row thuộc lần đồng bộ thành công gần nhất của tháng được API đọc;
- `synced_at`: thời điểm Apps Script đọc workbook.

Trạng thái:

- `matched`: có dòng `BC_BangLuong`, có output `XL_LuongNhanSu` và các trường chung đối chiếu trong sai số 0,5;
- `pending`: chưa có dòng cuối cùng trên `BC_BangLuong`;
- `needs_review`: thiếu output xử lý, khóa nhân sự va chạm hoặc có trường đối chiếu sai lệch.

Trạng thái trên là trạng thái **đối chiếu**, không phải trạng thái chốt kỳ.

## 4. Payload server-only

Payload gồm:

- `contractVersion`: version bắt buộc của read model; API không được trả payload thiếu/sai version như dữ liệu hợp lệ;
- `month`, `employeeKey`, `employeeName`;
- `status`, `warnings`, `sourceDataVersion`, `syncedAt`;
- `finalPayroll`: dòng có thẩm quyền từ `BC_BangLuong`;
- `personnelCalculation`: output tương ứng từ `XL_LuongNhanSu`;
- `salaryLines`: các dòng `XL_LuongTheoXe`, giữ riêng loại tính, xe, số chuyến, đơn giá, lương chuyến và điều chỉnh KPI;
- `attendance`: các dòng nghỉ/ngày công từ `NL_ChamCong`;
- `roleEvidence` `payroll-explanation-v6`: tuyển người đọc `DM_LichSuNhanSu`, chỉ đợt `Điều kiện thưởng=ĐỦ`; khoảng ngày là giao của tháng, ngày vào/nghỉ và tính/dừng thưởng. Mức tháng = quy tắc `TUYEN_DU_2_LAI`.`Số tiền/xe` / 2 có hiệu lực đầu tháng; chia số ngày thực của tháng, không giới hạn 30 ngày. Tổng raw làm tròn một lần đến 1.000 đồng; tiền từng đợt hiển thị làm tròn riêng. Đối chiếu `SYS_AggThuongTuyen`, sai/thiếu/đa nghĩa → needs_review; lỗi công thức/số không hợp lệ → dừng build, giữ cache trước. Thưởng khác giữ riêng. Version triển khai hiện hành do PROJECT_CONTEXT sở hữu.
- `reconciliation`: từng phép so sánh giữa output và báo cáo cuối cùng.

Không trả raw row index, Spreadsheet ID, secret hoặc dữ liệu của nhân sự khác trong cùng response.

## 5. Bảo mật và API

- Legacy dùng `payroll_explanation_bundles`; v6 dùng `payroll_explanation_bundles_v6` và RPC v6 riêng sau migration 017. Không sync v6 vào cache v5; giữ isolation cho rollback runtime. Hai bảng bật RLS nhưng không có policy đọc cho `anon`/`authenticated`.
- Thu hồi toàn bộ quyền trực tiếp của browser; chỉ `service_role` được đọc/ghi.
- `GET /api/app?action=getPayrollExplanation&month=MM/YYYY&employee=<tên>&year=YYYY` là proxy-local, đọc bằng service role sau khi xác thực session.
- Chỉ `admin` và `operator` được gọi và thấy cột/nút/dialog giải trình. `shareholder` xem bảng lương cuối nhưng không thấy giải trình; API vẫn deny-by-default dù gọi trực tiếp. Regression render thực: `tests/r8-payroll-role-render.test.js`.
- API resolve Spreadsheet ID từ `WORKBOOK_CONTEXTS_JSON`; không nhận hoặc tin Spreadsheet ID do browser gửi.
- Cache miss, payload sai `contractVersion` hoặc `source_data_version` khác report bundle hiện hành trả trạng thái `stale` và không trả payload cũ; không đọc trực tiếp Google Sheet trong request người dùng.
- Client admin/operator tự gọi `requestPayrollExplanationRefresh` đúng một lần, hiển thị trạng thái đồng bộ có `aria-live` và poll có giới hạn. Dữ liệu cũ bị ẩn cho tới khi report và giải trình cùng version.

## 6. Đồng bộ và invalidation

- `PayrollExplanationSyncService.syncMonth()` đọc workbook bằng `SpreadsheetApp.openById(id)` rồi upsert bundle.
- Đồng bộ tháng được gọi cùng report sync của tháng đó. Report tháng chỉ được publish sau khi giải trình cùng `source_data_version` thành công; lỗi giải trình được ghi `sync_status`, làm lượt report sync thất bại và được queue retry, nhưng không làm thay đổi dữ liệu Sheet.
- Report sync bắt đầu batch trước khi đọc, khóa nhãn version cho report/v6 và kiểm tra version trước đọc, sau dựng report và sau dựng/lưu v6. Version đổi giữa chừng → không publish report, queue retry; đây là kiểm tra phiên bản đã quan sát, không bảo đảm snapshot transaction cho mọi chỉnh sửa Sheet/công thức chưa được trigger phát hiện.
- Bundle không phải source of truth. Service phải build trọn bộ bundle mới trước, sau đó mới đánh dấu bundle cũ của tháng `is_current=false` và upsert bản mới. Lỗi đọc/build giữ nguyên bản gần nhất để phục hồi, trong khi API vẫn fail-closed nhờ so version với report hiện hành.
- Fingerprint nguồn đầy đủ giữ chu kỳ 5 phút; fingerprint output Báo cáo nhỏ gọn chạy mỗi phút để sớm xếp hàng lại tháng có công thức vừa thay đổi.
- API chỉ trả bundle đúng workbook, tháng và nhân sự được yêu cầu.

## 7. Gate Step A

- fixture phải có cùng nhân sự với cả `1_LAI` và `NHIEU_LAI`;
- tổng dòng lương chuyến phải khớp `BC_BangLuong` trong fixture hợp lệ;
- test phải chứng minh `NL_NghiVanHanh` không thể xuất hiện trong `attendance`;
- mismatch phải thành `needs_review` và nêu đúng trường;
- migration phải revoke `anon`/`authenticated` và chỉ grant `service_role`;
- API test phải chứng minh query được scope đúng workbook/tháng/nhân sự và shareholder không được cấp action.

## 8. UI Step B

- Vị trí duy nhất là `Báo cáo → Bảng Lương`; mỗi dòng nhân sự không phải dòng tổng có action icon-only 44×44px với accessible name.
- Chỉ kỳ đúng một tháng được mở giải trình. Kỳ nhiều tháng/năm không được ghép bằng chứng từ nhiều kỳ.
- Desktop dùng dialog căn giữa; mobile dùng bottom sheet. Cả hai cùng hiển thị tổng quan, chi tiết `1_LAI`/`NHIEU_LAI`, nghỉ phép/giảm trừ, thành phần lương, đối chiếu và cảnh báo.
- Màn hình và ảnh xuất dùng chung `PayrollExplanation` và `payrollExplanationView`; frontend không có phép tính lương thứ hai. Chức năng sao chép đã được loại bỏ để giữ drawer gọn.
- Tháng hiện tại ghi `Tạm tính đến …`; tháng trước ghi `Kỳ đã qua`; không dùng `Đã chốt`.
- Cột action có `data-export-hidden`, không xuất hiện trong ảnh bảng lương hoặc CSV.
- Icon action là mắt 24px nhưng vùng chạm vẫn 44px; không được làm hàng Bảng Lương cao hơn quy chuẩn Báo cáo.
- Bảng giải trình dùng cột nội dung vừa đủ, padding 6×8px và cuộn ngang cục bộ. Trạng thái khớp hiển thị tick xanh có accessible label; trạng thái sai vẫn có text `Cần kiểm tra`.
- Drawer chỉ có một header gồm tên nhân sự, kỳ, trạng thái và thao tác xuất ảnh/đóng. Trạng thái `Đã khớp` chỉ hiển thị tick xanh cạnh tên; không lặp lại thành một card trạng thái riêng. Trên mobile có tay nắm vuốt xuống để đóng; gesture chỉ bắt đầu từ tay nắm và không chiếm cuộn dọc hoặc cuộn ngang của bảng.
- Ảnh xuất giữ trạng thái đóng/mở hiện tại của các khối kỹ thuật; không tự bung `Xem cách tính chi tiết` hoặc `Kiểm tra dữ liệu nguồn`, tránh tạo ảnh dài ngoài ý muốn.
- Quản lý phải thấy KPI theo từng xe–dự án, số chuyến, mốc 112/140/168, tổng thưởng và ngày quản lý. Khi một biển số có nhiều dự án, UI nhóm chung dưới biển số nhưng giữ nguyên từng dòng dự án; phép tính vẫn lấy nguyên output `XL_ThuongQuanLy`, không cộng chuyến để tự chọn lại mốc thưởng ở frontend. Đồng thời phải thấy riêng người được tuyển, số ngày hiệu lực và tiền thưởng tuyển. Người tuyển chỉ thấy những người thực sự tạo thưởng trong tháng, số ngày, tiền thưởng, kỳ tính và công ty. Hai chức vụ này dùng view thưởng rút gọn. Nhân sự ở chức vụ khác vẫn giữ đầy đủ lương chuyến, lương cứng/khoán, nghỉ phép và nhận thêm khối thưởng tuyển nếu có dữ liệu. Webapp chỉ đọc dữ liệu nguồn, không ghi hoặc thay công thức Sheet.

## 9. Step D-A — Contract giải trình lương hỗn hợp theo ngày

### 9.1. Phạm vi hiệu lực

- Tham số `DM_ThamSo.NGAY_BAT_DAU_LOAI_LAI_THEO_NGAY` hiện là `01/08/2026`.
- Từ tháng 08/2026, dòng `HỖN_HỢP` được phép tách bằng chứng theo ngày.
- Trước mốc này, workbook xác định loại lái theo tháng. Webapp không được hồi tố một cách tính theo ngày rồi mô tả đó là công thức lịch sử.

### 9.2. Khóa ghép dữ liệu

Một dòng bằng chứng ngày có khóa:

```text
(ngày, biển số, nhóm vận hành, tài xế)
```

Quy trình ghép phải bám đúng công thức live:

1. lấy các dòng `NL_TaiXe` đúng tháng, biển số, tài xế;
2. chuẩn hóa `NL_TaiXe.Nhóm vận hành` qua `DM_DuAn[Dự Án → Nhóm vận hành]`, fallback về giá trị gốc khi không có mapping;
3. giữ các dòng đúng nhóm của `XL_LuongTheoXe`;
4. tra `SYS_AggTaiXeNgay` bằng khóa `(ngày, biển số, nhóm vận hành)` để lấy số tài xế duy nhất trên xe trong ngày;
5. `Số lái = 1` → `1_LAI`; `Số lái > 1` → `NHIEU_LAI`; thiếu/0 → `needs_review`, không tự quy về nhiều lái.

`SYS_AggTaiXeNgay.Số lái` đếm tài xế duy nhất, không đếm số dòng. Dòng `_SYS_DUPLICATE`/`_SYS_CHECK` bất thường trong `NL_TaiXe` phải tạo cảnh báo vì công thức workbook vẫn có thể cộng số chuyến từ dòng nguồn.

### 9.3. Chọn đơn giá

Đơn giá của cả hai loại không chọn theo số chuyến cá nhân. Ngưỡng tra `DM_LuongChuyen` là:

```text
ngưỡng đơn giá = Tổng xe sau cutoff nghỉ việc + Trừ KPI
```

Trong đó:

- `Tổng xe` là tổng chuyến xe/nhóm của dòng `XL_LuongTheoXe`; nếu nhân sự có ngày nghỉ việc trong tháng, workbook chỉ dùng chuyến xe đến ngày nghỉ việc để chọn bậc;
- `Trừ KPI` lấy từ `NL_NghiVanHanh` gián tiếp qua `XL_LuongTheoXe`; đây là số cộng lại để chọn bậc đơn giá, không phải khoản tiền khấu trừ và không cộng vào số chuyến cá nhân;
- tra riêng hai dòng `DM_LuongChuyen` cho `1_LAI` và `NHIEU_LAI`, đúng nhóm vận hành và khoảng hiệu lực giao với tháng báo cáo. Công thức live chọn dòng có cột `Từ` lớn nhất nhưng không vượt ngưỡng; cột `Đến` không tham gia phép chọn trong workbook hiện hành. Read model phải tái lập đúng phép chọn này, đồng thời cảnh báo `RATE_RANGE_GAP` nếu ngưỡng vượt `Đến` của dòng được chọn;
- nếu một loại thực sự xuất hiện trong tháng nhưng không có đúng một đơn giá hợp lệ, trạng thái là `needs_review`.

### 9.4. Phép tính và đối soát

Với từng dòng `HỖN_HỢP`:

```text
lương 1 lái     = Σ số chuyến cá nhân của ngày có Số lái = 1 × đơn giá 1_LAI
lương nhiều lái = Σ số chuyến cá nhân của ngày có Số lái > 1 × đơn giá NHIEU_LAI
lương giải trình = lương 1 lái + lương nhiều lái
```

Phải đối chiếu đồng thời:

- tổng chuyến ngày = `XL_LuongTheoXe.Cá nhân`;
- lương giải trình = `XL_LuongTheoXe.Lương chuyến`;
- `XL_LuongTheoXe.Lương chuyến thực` tiếp tục là output sau xử lý có thẩm quyền;
- tổng tất cả dòng xe của nhân sự = thành phần lương chuyến trong `XL_LuongNhanSu`/`BC_BangLuong`.

Chênh lệch bất kỳ, thiếu khóa ngày, thiếu đơn giá, nhiều đơn giá cùng hiệu lực hoặc thiếu dòng tổng có thẩm quyền đều phải `needs_review` và nêu đúng cấp: ngày, xe hay nhân sự.

### 9.5. Kết quả audit live ngày 23/09/2026

- Tháng 08/2026: 7 dòng `HỖN_HỢP`; 7/7 tái lập đúng `Lương chuyến`, không có chuyến thiếu số lái.
- Tháng 09/2026: 12 dòng `HỖN_HỢP`; 12/12 tái lập đúng `Lương chuyến`, không có chuyến thiếu số lái.
- Mẫu Chu Đức Mười, xe `20H06278`, tháng 09/2026:
  - ngưỡng đơn giá `80 + 21 = 101`;
  - 15 ngày/58 chuyến một lái × 250.000 = 14.500.000;
  - 2 ngày/4,5 chuyến nhiều lái × 270.000 = 1.215.000;
  - tổng 62,5 chuyến và 15.715.000, khớp tuyệt đối dòng `XL_LuongTheoXe`.
- Nguyễn Đức Tài có hai dòng `HỖN_HỢP` trên hai xe trong cùng tháng. Read model phải giữ từng xe riêng rồi mới cộng lên nhân sự; không gộp trước khi chọn ngưỡng/đơn giá.

Snapshot kiểm thử: `tests/fixtures/payroll-explanation-daily-mixed-audit.json`. Snapshot chỉ là characterization cho công thức đã quan sát; dữ liệu runtime vẫn phải đọc từ workbook/cache hiện hành.

### 9.6. Payload đề xuất cho Step D-B

Mỗi `salaryLine` có thêm:

- `rateBasis`: tổng xe, điều chỉnh KPI, ngưỡng cuối cùng và nguồn;
- `dailyEvidence[]`: ngày, xe, nhóm, chuyến cá nhân, tổng chuyến xe, số lái, loại tính, đơn giá, thành tiền và trạng thái khóa;
- `breakdown`: số ngày/chuyến/tiền của `1_LAI`, `NHIEU_LAI`, tổng giải trình và chênh lệch với dòng có thẩm quyền;
- `warnings`: mã cảnh báo ổn định cho thiếu aggregate, thiếu/trùng đơn giá, duplicate nguồn, sai tổng chuyến hoặc sai tổng tiền.

Không thêm sheet/hàm/cột vào workbook. Step D-B chỉ mở rộng read model Apps Script → Supabase server-only; frontend không tự tính lại lương.

## 10. Step D-B — Read model và cache theo ngày

`PayrollExplanationService` đọc thêm sáu nguồn chỉ đọc: `NL_TaiXe`, `SYS_AggTaiXeNgay`, `DM_LuongChuyen`, `DM_DuAn`, `DM_NhanSu`, `DM_ThamSo`.

Với mỗi dòng `HỖN_HỢP` từ mốc hiệu lực, payload có:

- `dailyEvidenceStatus`: `matched` hoặc `needs_review`; dòng không thuộc phạm vi là `not_applicable`;
- `rateBasis`: tổng xe báo cáo, tổng xe sau cutoff nghỉ việc, chuyến KPI được cộng lại, ngưỡng cuối cùng, ngày cutoff và hai đơn giá;
- `dailyEvidence[]`: một dòng mỗi ngày/tài xế/xe/nhóm sau khi cộng các dòng nguồn cùng ngày;
- `breakdown`: tổng ngày, chuyến, đơn giá và tiền riêng cho một lái/nhiều lái, cùng hai phép đối chiếu chuyến và tiền;
- `evidenceWarnings[]`: `{code, message, date}` với mã ổn định.

Các warning code hiện hành:

- `DAILY_DATE_MISSING`, `DAILY_SOURCE_INVALID`, `DAILY_EVIDENCE_EMPTY`;
- `DAILY_AGGREGATE_MISSING`, `DAILY_AGGREGATE_AMBIGUOUS`, `DAILY_DRIVER_COUNT_INVALID`;
- `RATE_MISSING`, `RATE_AMBIGUOUS`, `RATE_RANGE_GAP`, `DAILY_RATE_MISSING`;
- `DAILY_TRIP_TOTAL_MISMATCH`, `DAILY_SALARY_TOTAL_MISMATCH`.

Bất kỳ warning nào làm bundle nhân sự chuyển `needs_review`. Bundle JSONB hiện hữu chứa được payload mở rộng nên Step D-B không tạo migration Supabase mới, không thay đổi bảng hoặc quyền. Đồng bộ trả thêm số dòng hỗn hợp theo ngày đã khớp/cần kiểm tra để vận hành quan sát được.
