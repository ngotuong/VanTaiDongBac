# Vận Tải Đông Bắc 2026 - Tổng Hợp Cấu Trúc, Logic Và Hướng Dẫn Phát Triển Web App

Tài liệu này tổng hợp toàn bộ cấu trúc cơ sở dữ liệu Google Sheets, logic xử lý nghiệp vụ, thiết kế giao diện (CSS/HTML) và các cơ chế API/routing của Web App để lập trình viên (hoặc AI tiếp theo) có thể tiếp tục phát triển ứng dụng trong phiên làm việc mới mà không gặp bất kỳ lỗ hổng thông tin nào.

---

## 1. Thông Tin Môi Trường & Kết Nối

* **Spreadsheet**: `VanTaiDongBac_2026`  
* **Spreadsheet ID**: `1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA`  
* **Apps Script ID**: `1hNKU7xNvhORJSgv8mNIWKNguHU8bmCmM7mQBjxXLfv5FhawbN2HfJ2GX` (v47)
* **Frontend Web App URL**: [vtdongbac.vercel.app](https://vtdongbac.vercel.app)
* **Ghi chú kiến trúc mới**: Apps Script là web app độc lập trong My Projects, không gắn trực tiếp vào một Google Sheet. Code backend dùng chung cho nhiều file theo năm; spreadsheet active được resolve qua `AppConfig.gs` thay vì hard-code trong router.
* **Quy trình triển khai**:
  * Chạy code Apps Script cục bộ (trong thư mục này) và đẩy lên qua clasp:
    ```bash
    npx clasp push -f
    npx clasp deploy -i AKfycbzTp7g9JdYsP4x1kgL5iymJc67Sq7q1qjjLP-bPH2MBBitrAt-xv2W0qJSR9b6di6KAUA
    ```
  * Đẩy frontend lên GitHub (`origin/main`), Vercel tự động nhận diện webhook để build và deploy live.

---

## 2. Mô Hình Tổng Thể & Luồng Dữ Liệu

Google Sheets đóng vai trò là Database trung tâm được tổ chức thành 4 lớp:

1. **`NL_*` (Nhật ký - Nhật ký nhập liệu)**: Đầu vào thô từ biểu mẫu nhập liệu và quản lý trên Web App.
2. **`DM_*` (Danh mục - Dữ liệu tham chiếu)**: Các danh mục xe, nhân sự, đơn giá, tham số hệ thống.
3. **`XL_*` (Xử lý trung gian)**: Thực hiện tính toán đối soát, đơn giá áp dụng, lương chuyến, thưởng quản lý bằng các công thức mảng (`ARRAYFORMULA`, `MAP`, `LAMBDA`, `QUERY`).
4. **`BC_*` (Báo cáo)**: Đầu ra tổng hợp phục vụ dashboard, bảng lương và xe chạy.

```text
NL_VanChuyen + NL_TaiXe + NL_Dau + NL_ChamCong + NL_Phat + NL_NghiVanHanh
        |
        v (Kết hợp)
DM_Xe + DM_NhanSu + DM_DuAn + DM_ThamSo + DM_LuongChuyen + DM_DonGiaVanChuyen + DM_ThuongQuanLy
        |
        v (Xử lý công thức mảng)
XL_DoiSoatChuyen, XL_VanChuyen, XL_LuongTheoXe, XL_LuongNhanSu, XL_NgoaiLe, XL_ThuongQuanLy
        |
        v (Tổng hợp báo cáo)
BC_TongQuan, BC_BangLuong, BC_TongHopXe
```

*Lưu ý*: `IMP_ThuChi` là sheet đồng bộ qua `IMPORTRANGE` từ file Quản lý Thu Chi nội bộ riêng biệt, cung ứng dữ liệu ứng lương, phạt hành chính thực tế, phí đường bộ và chi quỹ.

---

## 3. Bản Đồ Dữ Liệu Sheet Chi Tiết

### 3.1. Các Sheet Nhật Ký Nhập Liệu (`NL_*`)

Tất cả các sheet nhập liệu đều có cột **Tháng** (Cột B hoặc C) tự động tính toán bằng Apps Script hoặc công thức mảng để gom nhóm dữ liệu.

| Sheet | Cấu trúc cột chính | Logic đặc thù |
| :--- | :--- | :--- |
| `NL_VanChuyen` | Ngày, Tháng, Biển số xe, Dự án, Số chuyến, Số phiếu, Ghi chú | Lưu thông tin các chuyến vận chuyển thực tế. Cột Tháng là cột B (ArrayFormula ở B2). |
| `NL_TaiXe` | Ngày, Tháng, Biển số xe, Tài xế, Số chuyến, Ghi chú | Do tài xế tự khai để đối soát và tính lương chuyến. |
| `NL_Dau` | Ngày, Tháng, Biển số xe, Nguồn dầu, Số lít, Giá dầu, Thành tiền, Ghi chú | `Thành tiền = Số lít * Giá dầu`. Hỗ trợ phân bổ nguồn (Quang Minh / Đổ ngoài) và phân loại chi quỹ. |
| `NL_ChamCong` | Từ ngày, Đến ngày, Tháng, Nhân sự, Loại ngày công, Số ngày, Tính lương cứng, Nhóm xử lý, Ghi chú | Tính số ngày nghỉ inclusive. Loại ngày công phân nhóm thành `NGHI_PHEP` hoặc `TRU_LUONG`. |
| `NL_Phat` | Ngày, Tháng, Nhân sự, Mã phạt, Nội dung phạt, Số tiền phạt, Ghi chú | Tra cứu nội dung và số tiền chuẩn từ `DM_PhatNoiBo`. |
| `NL_NghiVanHanh`| Ngày, Tháng, Biển số xe, Dự án, Loại nghỉ, Số giờ nghỉ, Tính KPI?, Giảm KPI, Ghi chú | Tính giảm KPI: `Số giờ nghỉ / 4`. Nếu `Tính KPI? = Có`, số chuyến này được lùi trừ trực tiếp vào mốc thưởng KPI. |

### 3.2. Lớp Danh Mục (`DM_*`)

| Sheet | Cấu trúc cột chính | Logic & Ứng dụng |
| :--- | :--- | :--- |
| `DM_Xe` | Biển số xe, Khối lượng, Loại xe, Trạng thái, Công ty sở hữu | `Công ty sở hữu` (Quang Quân / Minh Vương) dùng để tách chi phí, doanh thu. |
| `DM_NhanSu` | Nhân sự, Chức vụ, Người tuyển, Bắt đầu thưởng, Kết thúc thưởng, Ngày vào, Ngày nghỉ, Lương cứng, Lương khoán | Quản lý thông tin nhân sự. Lọc ra danh sách Tài xế đang làm việc làm dữ liệu dropdown. |
| `DM_PhanCong` | Biển số, Tài xế, Vai trò (Chính/Phụ), Từ ngày, Đến ngày | Dùng gợi ý tài xế theo biển số xe và ngày tương ứng trên form nhập liệu. |
| `DM_ThamSo` | **Bảng kép song song**: <br>• Cột A-D: Mã tham số, Tên tham số, Giá trị, Ghi chú<br>• Cột E-G: Giá dầu áp dụng, Ngày áp dụng giá dầu, Ghi chú | Hệ thống chia thành hai sub-tab ảo trên Web App: **Tham số hệ thống** (`DM_ThamSo_TS`) và **Lịch sử giá dầu** (`DM_ThamSo_GD`). |
| `DM_PhatNoiBo` | Mã phạt, Nội dung phạt, Số tiền, Trạng thái | Nguồn tham chiếu tự động cho form phạt. |

---

## 4. Kiến Trúc Backend (Google Apps Script)

Backend chạy bằng Google Apps Script, xử lý thông qua file [Code.gs](file:///Users/ngotuong/AppsScript/VanTaiDongBac_2026_WebApp/Code.gs) đóng vai trò router nhận HTTP POST/GET.

Từ bản refactor nền:
* `AppConfig.gs` quản lý spreadsheet ID active. Có thể dùng Script Properties `ACTIVE_SPREADSHEET_ID`, `DEFAULT_SPREADSHEET_ID`, hoặc `SPREADSHEET_ID_2026`, `SPREADSHEET_ID_2027`, ...
* API có thể nhận `year`, `spreadsheetId`, hoặc `ssId` để trỏ sang file năm khác khi cần.
* Cache backend trong `SheetService.gs` đã scoped theo spreadsheet ID để tránh lẫn dữ liệu giữa các file năm.

### 4.1. Cơ Chế Định Tuyến API

Mọi request được điều phối qua `doGet(e)` và `doPost(e)`:

* **GET**:
  * `getInitialData`: Trả về thông tin ban đầu, liên kết trang tính, cấu hình form và danh mục cơ bản.
  * `getReports`: Lấy dữ liệu báo cáo tổng hợp theo tháng (từ `CacheService` với thời gian sống 180s).
  * `getCatalogs`: Tải toàn bộ danh mục tham chiếu (hoặc lọc theo `formType` cụ thể).
  * `readSheetData`: Đọc thô dữ liệu từ một sheet bất kỳ (hỗ trợ lọc ngày tháng, phân trang, và chia cột ảo cho `DM_ThamSo`).
* **POST**:
  * `submitRows`: Ghi đè hoặc append danh sách dòng nhập liệu mới vào `NL_*`.
  * `saveSheetRow`: Tạo mới hoặc cập nhật một dòng bất kỳ (dùng cho tính năng CRUD Quản lý/Danh mục).
  * `deleteSheetRow`: Xóa hẳn dòng vật lý hoặc chỉ xóa (`clear`) các ô thuộc cột cụ thể (như sub-tab ảo của `DM_ThamSo`).

### 4.2. Xử Lý Ghi Đè ARRAYFORMULA & Formula Tránh Lỗi Cột Tháng

Lỗi `"Bạn không thể đặt định dạng số của các ô trong một cột đã nhập"` xảy ra khi Apps Script cố gắng định dạng số (`setNumberFormat`) hoặc ghi đè giá trị tĩnh vào một cột chứa công thức mảng (`ArrayFormula`).

* **Giải pháp**:
  * Trong `SheetService.gs` -> `applyFormats_`: Bỏ qua các cột Tháng (Cột B hoặc C chứa ArrayFormula) không áp dụng định dạng số.
  * Trong `SheetService.gs` -> `saveSheetRow`:
    1. Trước khi cập nhật dòng, hệ thống đọc lại toàn bộ công thức gốc (`getFormulas()[0]`) và giá trị gốc (`getValues()[0]`).
    2. Nếu cột đó chứa công thức (ví dụ: `=ARRAYFORMULA(...)` hoặc `=DATE(...)`), Apps Script giữ nguyên chuỗi công thức đó ghi ngược lại, tránh làm hỏng cấu trúc.
    3. Nếu là cột Tháng (`header === 'Tháng'`) của các sheet Nhật ký (`NL_*`), Apps Script ép giá trị ghi xuống là `""` (chuỗi rỗng) để Google Sheets tự động điền giá trị theo ArrayFormula mà không gây lỗi ghi đè ô.

### 4.3. Logic Gộp Báo Cáo Tháng "Tất cả" (Báo Cáo Chi Tiết)

Trang báo cáo hỗ trợ tùy chọn lọc **"Tất cả"** các tháng.
* Đối với **Báo cáo tổng quan** & **Bảng lương**: Apps Script bỏ qua việc lọc tháng (bypass `filterDisplayTableByMonth_`).
* Đối với **Báo cáo chi tiết** (phụ thuộc vào ô điều khiển B1 trong sheet `BC_TongQuan` để chạy công thức mảng động):
  1. Apps Script duyệt qua danh sách tất cả các tháng có dữ liệu.
  2. Với mỗi tháng, hệ thống ghi đè giá trị tháng đó vào ô `B1` của sheet `BC_TongQuan`, đợi Google Sheets tính toán lại, rồi đọc bảng dữ liệu chi tiết của tháng đó.
  3. Tổng hợp và cộng dồn số liệu của từng dòng danh mục (giữ nguyên phân tách cột công ty Quang Quân và Minh Vương).
  4. Trả về bảng dữ liệu gộp tổng hợp, sau đó khôi phục lại giá trị tháng ban đầu cho ô `B1`.

---

## 5. Giao Diện Người Dùng & Các Tối Ưu Hóa Trải Nghiệm (index.html)

Giao diện là Web App SPA thiết kế tối ưu hóa cho thiết bị di động (Mobile-First / Safari di động).

Từ bản refactor nền:
* `index.html` chỉ giữ HTML shell.
* `styles.html` chứa CSS.
* `client.html` chứa JavaScript frontend.
* `Code.gs` render bằng `HtmlService.createTemplateFromFile('index')` và helper `include(filename)`.

### 5.1. Hệ Thống Điều Hướng & Quản Lý View

Hệ thống quản lý 5 view chính:
* `home` (Báo cáo tổng quan): Các thẻ KPI tài chính và biểu đồ hiệu năng.
* `entry` (Nhập liệu): Hỗ trợ nhập liệu nhiều dòng nhanh.
* `reports` (Báo cáo chi tiết): Báo cáo chi tiết lương và xe.
* `manage` (Quản lý nhật ký): CRUD trực quan các sheet nhật ký.
* `catalog` (Quản lý danh mục): CRUD các danh mục hệ thống và tham số.

### 5.2. Biểu Mẫu Nhập Liệu & Preview Công Thức Real-time

Khi người dùng soạn thảo, ứng dụng tự động hiển thị thông tin tính toán tự động:
* **Chấm công**: Hiển thị số ngày nghỉ và lương cứng (`Lương cứng: Có/Không`) tương ứng loại phép đã chọn.
* **Phạt**: Hiển thị mô tả vi phạm và số tiền phạt theo mã phạt đã chọn.
* **Nghỉ vận hành**: Hiển thị số chuyến bị giảm trừ KPI dự kiến.

### 5.3. Tối Ưu Hiệu Năng: Caching & Debouncing

* **Client-Side Catalog Caching**: Dữ liệu danh mục hệ thống được tải gộp một lần và lưu trữ vào `sessionStorage` dưới khóa `eb_catalogs_all`. Các popup và gợi ý CRUD sử dụng dữ liệu này trực tiếp giúp tăng tốc độ phản hồi tối đa.
* **Search Debouncing**: Thanh tìm kiếm trang Quản lý và Danh mục có bộ trễ **150ms** để đảm bảo giao diện luôn phản hồi mượt mà khi người dùng gõ tìm kiếm nhanh trên bảng dữ liệu lớn.
* **Bộ Lọc Dầu Lẻ**: Cho phép lọc Nguồn dầu, Nhà xe (bao gồm tìm kiếm từ khóa `"quỹ"` case-insensitive trong trường Ghi chú để lọc các khoản chi dầu lẻ từ Quỹ nội bộ), kèm thống kê Tổng số lít và Tổng thành tiền tức thì.

---

## 6. Hướng Dẫn Tiếp Tục Phát Triển

Khi tiếp quản dự án ở phiên làm việc tiếp theo:
1. Luôn dùng lệnh `clasp push` và `clasp deploy` với ID phù hợp để đưa code backend lên.
2. Không ghi đè trực tiếp các cột tính toán tự động trong `NL_*`.
3. Kiểm tra kỹ logic `LockService` ở Backend để đảm bảo an toàn ghi chép đồng thời.
4. Tránh sửa đổi cấu trúc cột Google Sheet mà không cập nhật tương ứng ở `ValidationService.gs` và các hàm Javascript của `index.html`.
