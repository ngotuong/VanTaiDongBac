# VanTaiDongBac_2026 - Tong Hop Cau Truc, Logic Va Web App

Cap nhat: 23/06/2026  
Spreadsheet: `VanTaiDongBac_2026`  
Spreadsheet ID: `1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA`  
Apps Script ID: `1hNKU7xNvhORJSgv8mNIWKNguHU8bmCmM7mQBjxXLfv5FhawbN2HfJ2GX`

Tai lieu nay duoc lap de ban co the tiep tuc xay dung file o mot cuoc tro chuyen khac. Nguon thong tin gom: workbook Google Sheet hien tai duoc export sang `.xlsx`, code Apps Script web app trong thu muc nay, va cac thay doi logic da chot trong cuoc tro chuyen truoc.

Luu y: khi Google Sheets export sang Excel, mot so cong thuc Google Sheets nhu `MAP`, `LAMBDA`, `QUERY`, `IMPORTRANGE`, `COUNTUNIQUEIFS` co the hien thanh `DUMMYFUNCTION` trong `.xlsx`. Vi vay tai lieu nay uu tien mo ta logic nghiep vu va cac cong thuc neo quan trong, khong coi file Excel la ban sao cong thuc tuyet doi 100%.

## 1. Mo Hinh Tong The

File dang duoc thiet ke theo 4 lop:

1. `NL_*` - Nhap lieu hang ngay.
2. `DM_*` - Danh muc va tham so.
3. `XL_*` - Xu ly trung gian, doi soat, tinh luong, ngoai le.
4. `BC_*` - Bao cao cuoi cung.

Luong du lieu chinh:

```text
NL_VanChuyen + NL_TaiXe + NL_Dau + NL_ChamCong + NL_Phat + NL_NghiVanHanh
        |
        v
DM_Xe + DM_NhanSu + DM_DuAn + DM_ThamSo + DM_LuongChuyen + DM_DonGiaVanChuyen + DM_ThuongQuanLy
        |
        v
XL_DoiSoatChuyen, XL_VanChuyen, XL_LuongTheoXe, XL_LuongNhanSu, XL_NgoaiLe, XL_ThuongQuanLy
        |
        v
BC_TongQuan, BC_BangLuong, BC_TongHopXe
```

`IMP_ThuChi` la sheet import tu file thu chi rieng va duoc dung cho: ung luong, tra luong, phat, thuong, phi duong bo, chi phi xe, chi quy, thue, cong no.

## 2. Danh Sach Sheet Hien Tai

Workbook export hien co 25 sheet:

| Nhom | Sheet | Vai tro | Trang thai |
| --- | --- | --- | --- |
| Nhap lieu | `NL_VanChuyen` | So lieu chuyen xe theo ngay/xe/du an | Visible |
| Nhap lieu | `NL_TaiXe` | So chuyen tung tai xe khai/chay | Visible |
| Nhap lieu | `NL_Dau` | So lieu do dau, nguon dau, so lit, gia, thanh tien | Visible |
| Nhap lieu | `NL_ChamCong` | Nghi phep/nghi tru luong/nghi viec tam thoi | Visible |
| Nhap lieu | `NL_Phat` | Phat noi bo theo nhan su | Visible |
| Nhap lieu | `NL_NghiVanHanh` | Gio nghi van hanh va giam KPI | Visible |
| Xu ly | `XL_DoiSoatChuyen` | Doi soat chuyen bao cao voi chuyen tai xe | Visible |
| Xu ly | `XL_VanChuyen` | Tinh khoi luong, don gia, doanh thu van chuyen | Visible |
| Xu ly | `XL_LuongTheoXe` | Tinh luong chuyen theo xe/tai xe | Visible |
| Xu ly | `XL_LuongNhanSu` | Tong hop luong nhan su, luong cung, thuong, ung/phat | Visible |
| Xu ly | `XL_NgoaiLe` | Dieu chinh ngoai le luong chuyen | Visible |
| Xu ly | `XL_ThuongQuanLy` | Thuong quan ly/tuyen lai/KPI theo xe | Visible |
| Bao cao | `BC_TongQuan` | Bao cao tong quan doanh thu, thue, dau, quy, loi nhuan | Visible |
| Bao cao | `BC_BangLuong` | Bang luong cuoi cung | Visible |
| Bao cao | `BC_TongHopXe` | Tong hop xe theo thang/cong ty/bien so | Visible |
| Danh muc | `DM_DuAn` | Du an, so km, hieu luc | Hidden |
| Danh muc | `DM_Xe` | Xe, khoi luong, trang thai, cong ty so huu | Hidden |
| Danh muc | `DM_NhanSu` | Nhan su, chuc vu, nguoi tuyen, luong, ngay vao/nghi | Visible |
| Danh muc | `DM_PhanCongLaiXe` | Phan cong tai xe theo xe va giai doan | Visible |
| Danh muc | `DM_LuongChuyen` | Bac don gia luong chuyen theo loai 1 lai/nhieu lai | Hidden |
| Danh muc | `DM_ThamSo` | Tham so toan cuc va lich su gia dau | Hidden |
| Danh muc | `DM_DonGiaVanChuyen` | Don gia van chuyen theo du an va so chuyen/ngay | Hidden |
| Danh muc | `DM_ThuongQuanLy` | Quy tac thuong quan ly/tuyen lai/moc chuyen | Hidden |
| Danh muc | `DM_PhatNoiBo` | Ma phat noi bo, noi dung, so tien | Hidden |
| Import | `IMP_ThuChi` | Import tu file ThuChiDongBac_2026 | Visible |

## 3. Cac Sheet Nhap Lieu `NL_*`

### `NL_VanChuyen`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so xe |
| D | Du an |
| E | So chuyen |
| F | So phieu |
| G | Ghi chu |

Logic:

- Cot B tu sinh thang theo ngay: `DATE(YEAR(A), MONTH(A), 1)`.
- Dong 1 co tong phu bang `SUBTOTAL`, dung khi filter.
- Du lieu nay la nguon chinh de tinh doanh thu van chuyen trong `XL_VanChuyen`.

### `NL_TaiXe`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so xe |
| D | Tai xe |
| E | So chuyen |
| F | Ghi chu |

Logic:

- Dung de tinh luong chuyen theo tai xe.
- `XL_DoiSoatChuyen` so sanh tong so chuyen tai xe voi `NL_VanChuyen`.
- `XL_LuongTheoXe` gom theo thang, tai xe, xe va tong so chuyen.

### `NL_Dau`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so xe |
| D | Nguon dau |
| E | So lit |
| F | Gia dau |
| G | Thanh tien |
| H | Ghi chu/noi dung |

Logic:

- Cot B tu sinh thang theo ngay.
- Cot G = `So lit * Gia dau`.
- Dung trong `BC_TongQuan` va `BC_TongHopXe`.
- Quy uoc da chot:
  - Nguon `Quang Minh` hoac du lieu cu co nguon `Cong ty/Cong ty` duoc coi la dau nguon Quang Minh.
  - Nguon `Do ngoai/Đổ ngoài` neu ghi chu co `Quang Quan/Quang Quân` hoac `Minh Vuong/Minh Vương` thi tinh vao dong dau do ngoai cua tung cong ty.
  - Nguon `Do ngoai/Đổ ngoài` neu ghi chu co `Quy/Quỹ` thi cong vao `Chi quy thuc te`.

### `NL_ChamCong`

Cot:

| Cot | Ten |
| --- | --- |
| A | Tu ngay |
| B | Den ngay |
| C | Thang |
| D | Nhan su |
| E | Loai ngay cong |
| F | So ngay |
| G | Tinh luong cung |
| H | Nhom xu ly |
| I | Ghi chu |
| J | Loai ngay cong hop le |
| K | Luu y |

Logic:

- So ngay = so ngay inclusive tu `Tu ngay` den `Den ngay`.
- Thang theo `Tu ngay`.
- Cac nhom xu ly:
  - `Nghi phep` -> nhom `NGHI_PHEP`, thuong mac dinh van tinh luong cung.
  - `Nghi khong phep`, `Nghi khong luong`, `Nghi viec tam thoi` -> nhom `TRU_LUONG`, khong tinh luong cung.
- Luu y quan trong: neu nghi qua 2 thang thi tach thanh 2 dong theo tung thang.

### `NL_Phat`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Nhan su |
| D | Ma phat |
| E | Noi dung phat |
| F | So tien phat |
| G | Ghi chu |

Logic:

- `Ma phat` tra cuu tu `DM_PhatNoiBo`.
- `Noi dung phat` va `So tien phat` co the tu dong lay theo ma phat.
- Tien phat duoc cong vao phan tru trong `XL_LuongNhanSu`/`BC_BangLuong`.

### `NL_NghiVanHanh`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so xe |
| D | Du an |
| E | Loai nghi |
| F | So gio nghi |
| G | Tinh KPI? |
| H | Giam KPI |
| I | Ghi chu |

Logic:

- `Giam KPI` mac dinh = `So gio nghi / SO_GIO_1_CHUYEN_KPI`.
- `SO_GIO_1_CHUYEN_KPI` nam trong `DM_ThamSo`, hien logic web app fallback la 4 gio/chuyen.
- Neu `Tinh KPI?` khac `Co/Có`, `Giam KPI = 0`.
- Co che lui KPI da duoc ap dung cho tai xe va quan ly:
  - Vi du 40 gio nghi -> giam 10 chuyen KPI.
  - Moc 140 thanh 130.
  - Moc 168 thanh 158.

## 4. Danh Muc Va Tham So `DM_*`

### `DM_Xe`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Bien so xe |
| B | Khoi luong |
| C | Loai xe |
| D | Trang thai |
| F | Cong ty so huu |

Logic:

- `Khoi luong` * `So chuyen` = tong khoi luong trong `XL_VanChuyen`.
- `Cong ty so huu` dang dung de tach bao cao theo `Quang Quan/Quang Quân` va `Minh Vuong/Minh Vương`.
- Web app chi uu tien xe `Dang chay/Đang chạy`.

### `DM_NhanSu`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Nhan su |
| B | Chuc vu |
| C | Nguoi tuyen |
| D | Bat dau thuong |
| E | Ket thuc thuong |
| F | Ngay vao |
| G | Ngay nghi viec |
| H | Luong cung |
| I | Ngay nghi chuan |
| J | Trang thai |
| K | DS_TaiXe_DangLam |
| L | Loai luong |
| M | Luong khoan |
| N | Thang bat dau khoan |
| O | Thang ket thuc khoan |

Logic:

- `Nguoi tuyen`, `Bat dau thuong`, `Ket thuc thuong` lien quan thuong tuyen lai trong `XL_ThuongQuanLy` va thuong nhan su.
- Quan ly/nhan su khong nhan `Luong cung` theo cong thuc tai xe neu da co quy tac khac.
- Web app uu tien nhan su `Dang lam/Đang làm`, tai xe co `Chuc vu = Tài xế`.

### `DM_PhanCongLaiXe`

Cot:

| Cot | Ten |
| --- | --- |
| A | Bien so |
| B | Tai xe |
| C | Vai tro |
| D | Tu ngay |
| E | Den ngay |
| F | Duoc huong moc? |
| G | Thieu lai? |
| H | Ghi chu |

Logic:

- Dung de biet xe co bao nhieu lai, co thieu lai khong.
- Web app co the goi y tai xe theo bien so va ngay.

### `DM_LuongChuyen`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ma loai tinh |
| B | Dien giai |
| C | Tu chuyen |
| D | Den chuyen |
| E | Don gia/chuyen |
| F | Hieu luc tu |
| G | Hieu luc den |

Logic:

- Ma loai tinh: `1_LAI`, `NHIEU_LAI`.
- `XL_LuongTheoXe` lay don gia theo:
  - loai tinh,
  - tong chuyen sau khi cong nguong nghi de xet bac,
  - thang hieu luc.

### `DM_ThamSo`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Ma tham so |
| B | Ten tham so |
| C | Gia tri |
| D | Ghi chu |
| F | Ngay ap dung |
| G | Gia dau ap dung |
| H | Ghi chu gia dau |

Tham so quan trong:

- `GIA_DAU_GOC`
- `BUOC_GIA_DAU`
- `BUOC_DON_GIA`
- `MOC_KPI_CHUYEN`
- `THUONG_VUOT_168`
- `NGHI_CHUAN_THANG`
- `THUE_VAT_RATE`
- `THUE_TNDN_RATE`
- `SO_GIO_1_CHUYEN_KPI`

Logic:

- Phan F:G la lich su gia dau ap dung theo ngay.
- `XL_VanChuyen` dung gia dau ap dung de dieu chinh don gia van chuyen.
- `BC_TongQuan` dung VAT/TNDN rate de tinh thue.

### `DM_DonGiaVanChuyen`

Cot:

| Cot | Ten |
| --- | --- |
| A | Du an |
| B | Tu chuyen |
| C | Den chuyen |
| D | Don gia goc |
| E | Ghi chu |

Logic:

- `XL_VanChuyen` lay don gia goc theo du an va so chuyen/ngay.
- Vi du du an `Trang Due/Tràng Duệ` co cac bac don gia theo so chuyen.

### `DM_ThuongQuanLy`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ma thuong |
| B | Noi dung thuong |
| C | Dieu kien |
| D | So tien/xe |
| E | Trang thai |
| F | Ghi chu |
| G | Hieu luc tu |
| H | Hieu luc den |

Ma quan trong:

- `TUYEN_DU_2_LAI`
- `CHUYEN_112`
- `CHUYEN_140`
- `CHUYEN_168`

Logic:

- Dung trong `XL_ThuongQuanLy`.
- Moc 140 va 168 da duoc lui theo `NL_NghiVanHanh!H:H` neu `Tinh KPI? = Có`.

### `DM_PhatNoiBo`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ma phat |
| B | Noi dung phat |
| C | So tien |
| D | Trang thai |
| E | Ghi chu |
| F | Hieu luc tu |
| G | Hieu luc den |

Logic:

- Web app va `NL_Phat` dung de tu dong dien noi dung/so tien phat.

## 5. Import Thu Chi `IMP_ThuChi`

Cot:

| Cot | Ten |
| --- | --- |
| A | So phieu |
| B | Ngay |
| C | Muc |
| D | So tien |
| E | Nha cung cap |
| F | Noi dung |
| G | Thang tinh |
| H | Doi tuong |
| I | Loai tinh |
| J | Cong no |

Logic quan trong:

- Du lieu lay tu file ThuChi rieng qua `IMPORTRANGE` tu spreadsheet ID `1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw`.
- Cot `Thang tinh` khong phai luc nao cung bang thang cua ngay chi tien.
- Neu noi dung co `T5`, `T6`,... thi `Thang tinh` duoc suy ra theo noi dung de dung cho nghiep vu, vi du ung luong ngay 02/06 nhung ghi `T5` thi khau tru bang luong thang 5.
- Cot `Doi tuong` loai bo hau to `T5/T6` trong noi dung.
- Cot `Loai tinh` phan loai cac muc: `Ung luong`, `Phat`, `Thuong`, `Thue`, `Tra luong`, `Phi duong bo`, `Gop quy`,...
- Cot `Cong no` giu trang thai cong no. Dong phat sinh cong no ban dau co `Cong no = Có` khong tinh vao chi quy thuc te; khi tat toan moi tinh theo ngay tat toan.

Quy uoc da chot:

- `Thang tinh` tiep tuc dung cho nghiep vu: bang luong, khau tru ung luong, phan bo noi dung `T5/T6`.
- `Chi quy thuc te` trong `BC_TongQuan` dung thang cua `Ngay` de khop dong tien that.

## 6. Xu Ly Trung Gian `XL_*`

### `XL_DoiSoatChuyen`

Cot:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so |
| D | Du an |
| E | Bao cao |
| F | Thuc te |
| G | Chenh lech |
| H | Trang thai |

Logic:

- Lay dong tu `NL_VanChuyen`.
- `Bao cao` = so chuyen trong `NL_VanChuyen`.
- `Thuc te` = `SUMIFS(NL_TaiXe!E:E, ngay, xe)`.
- `Chenh lech = Bao cao - Thuc te`.
- Trang thai:
  - `Khớp` neu bang 0.
  - `Thiếu chuyến tài xế` neu bao cao lon hon tai xe.
  - `Tài xế khai dư` neu tai xe khai lon hon bao cao.

### `XL_VanChuyen`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so |
| D | Du an |
| E | So chuyen |
| F | Tong khoi luong |
| G | So km |
| H | Gia dau ap dung |
| I | Don gia goc |
| J | Dieu chinh dau |
| K | Don gia ap dung |
| L | Doanh thu uoc tinh |
| M | Cong ty so huu |
| N | Ghi chu |

Logic cong thuc:

- A:E lay tu `NL_VanChuyen`.
- F = khoi luong xe trong `DM_Xe!B:B` * so chuyen.
- G = so km tu `DM_DuAn`, co xet hieu luc theo ngay.
- H = gia dau ap dung theo ngay tu `DM_ThamSo!F:G`.
- I = don gia goc tu `DM_DonGiaVanChuyen`, theo du an va so chuyen.
- J = `(Gia dau ap dung - GIA_DAU_GOC) / BUOC_GIA_DAU * BUOC_DON_GIA`.
- K = `ROUND(Don gia goc + Dieu chinh dau, 0)`.
- L = `Tong khoi luong * Don gia ap dung`.
- M = cong ty so huu theo `DM_Xe!F:F`.

### `XL_LuongTheoXe`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Thang |
| B | Tai xe |
| C | Bien so xe |
| D | Ca nhan |
| E | Tong cua xe |
| F | So lai |
| G | Loai tinh |
| H | Don gia |
| I | Luong chuyen |
| J | Nghi tinh chi tieu |
| K | Chi tieu sau nghi |
| L | Chuyen vuot 168 |
| M | Thuong vuot 168 |
| N | Dieu chinh ngoai le |
| O | Luong chuyen cuoi |

Logic:

- A:D tao bang gom tu `NL_TaiXe`.
- E = tong so chuyen cua xe trong thang.
- F = so tai xe duy nhat cua xe/thang.
- G = `1_LAI` neu F = 1, nguoc lai `NHIEU_LAI`.
- J = tong `Giam KPI` tu `NL_NghiVanHanh` theo thang/xe voi `Tinh KPI? = Có`.
- K = `MOC_KPI_CHUYEN - J`.
- L = so chuyen vuot moc KPI sau nghi.
- M = L * `THUONG_VUOT_168`.
- H lay don gia theo `DM_LuongChuyen`. Cong thuc dang xet bac bang `Tong cua xe + Nghi tinh chi tieu` de tranh mat bac don gia khi co nghi van hanh.
- N lay dieu chinh tu `XL_NgoaiLe`.
- O = `Luong chuyen + Dieu chinh ngoai le`.

### `XL_NgoaiLe`

Vai tro:

- Xu ly cac truong hop thieu lai, dieu chinh don gia, can kiem tra.
- Co cac cot phu an/hien trong cung sheet, vi export cho thay sheet co nhieu cot toi Y.
- Day la sheet nen giu can than: no co ve nhieu cot phu, nhung hien dang cap du lieu cho `XL_LuongTheoXe!N:N`.

Cot dau:

| Cot | Ten |
| --- | --- |
| A | Ngay |
| B | Thang |
| C | Bien so |
| D | Tai xe |
| E | So chuyen |
| F | Truong hop |
| G | Don gia co ban |
| H | Don gia ap dung |
| I | Dieu chinh ngoai le |
| J | Can kiem tra |

### `XL_ThuongQuanLy`

Cot:

| Cot | Ten |
| --- | --- |
| A | Thang |
| B | Bien so xe |
| C | Tong chuyen |
| D | Thuong tuyen lai |
| E | Thuong moc 0-112 |
| F | Thuong moc 140 |
| G | Thuong moc 168 |
| H | Tong thuong moc QL |
| I | Tong ngay QL |

Logic:

- A:C lay tong chuyen theo xe/thang tu `XL_LuongTheoXe`.
- D tinh thuong tuyen lai theo `DM_NhanSu` va `DM_ThuongQuanLy`.
- E tinh thuong mốc 0-112.
- F tinh mốc 140 sau khi lui KPI:
  - `nghi = SUMIFS(NL_NghiVanHanh!H:H, thang, xe, Tinh KPI?="Có")`
  - `moc = 140 - nghi`
  - neu tong chuyen >= moc thi lay tien thuong `CHUYEN_140`.
- G tuong tu F voi moc 168:
  - `moc = 168 - nghi`
  - neu tong chuyen >= moc thi lay tien thuong `CHUYEN_168`.
- H = E + F + G.
- I tinh tong ngay quan ly lam viec trong thang, tru ngay nghi.

### `XL_LuongNhanSu`

Cot chinh:

| Cot | Ten |
| --- | --- |
| A | Thang |
| B | Nhan su |
| C | Chuc vu |
| D | So chuyen |
| E | Luong chuyen |
| F | Luong cung |
| G | Ngay vao lam |
| H | Ngay nghi viec |
| I | Nghi chuan/thang |
| J | Ngay bien che |
| K | Nghi phep |
| L | Nghi vuot phep |
| M | Nghi tru luong |
| N | Ngay tru luong |
| O | Luong cung/ngay |
| P | Luong cung thuc |
| Q | Thuong |
| R | Ung luong |
| S | Phat |
| T | Tong luong |
| U | Thuc nhan |

Logic:

- Gop nhan su tu `DM_NhanSu`, tai xe co trong `XL_LuongTheoXe`, va nguoi tuyen.
- Luong chuyen lay tu `XL_LuongTheoXe`.
- Luong cung:
  - lay tu `DM_NhanSu!H:H`.
  - quan ly/nhan su co xu ly rieng theo cong thuc.
- Ngay bien che tinh theo ngay vao/ngay nghi trong thang.
- Nghi phep tu `NL_ChamCong` loai `Nghỉ phép`.
- Nghi vuot phep = max(0, nghi phep - nghi chuan).
- Nghi tru luong tu `NL_ChamCong` co `Tinh lương cứng = Không`.
- Luong cung thuc = luong cung theo ngay bien che tru ngay bi tru luong.
- Thuong:
  - quan ly lay tu `XL_ThuongQuanLy`, phan bo theo ngay quan ly.
  - nguoi tuyen co the co thuong tuyen lai theo quy tac.
  - neu co luong khoan thi uu tien logic khoan va co the khong cong thuong quan ly.
- Ung luong lay tu `IMP_ThuChi` theo `Thang tinh`, `Doi tuong`, `Loai tinh = Ứng lương`.
- Phat = phat tu `IMP_ThuChi` + `NL_Phat`.
- Tong luong = luong chuyen + luong cung thuc + thuong.
- Thuc nhan = tong luong - ung luong - phat.

## 7. Bao Cao `BC_*`

### `BC_TongQuan`

Day la bao cao tong quan theo thang dang duoc sua gan nhat.

O dieu khien:

- `B1`: thang dang xem.
- `B3`: lay `=B15`, la loi nhuan thuc.
- `C3`: trang thai `Lợi nhuận dương / Lợi nhuận âm / Hòa vốn`.

Bang chi tiet ben trai hien tai:

| Dong | Danh muc | Ghi chu |
| --- | --- | --- |
| 5 | Tong khoi luong | Tach tong/Quang Quan/Minh Vuong theo `DM_Xe!F:F` |
| 6 | Tong doanh thu | Tach tong/Quang Quan/Minh Vuong |
| 7 | Doanh thu chua VAT | Doanh thu / (1 + VAT) |
| 8 | Thue TNDN | Doanh thu chua VAT * TNDN rate |
| 9 | Thue VAT | Doanh thu - doanh thu chua VAT |
| 10 | Chi phi dau (nguon Quang Minh) | Nguon `Quang Minh` hoac `Cong ty/Công ty`; tach theo cong ty so huu xe |
| 11 | Chi phi dau (do ngoai - QQ/MV) | Nguon `Do ngoai/Đổ ngoài`; ghi chu co Quang Quan/Minh Vuong |
| 12 | Phi duong bo | Tu `IMP_ThuChi`, loai tinh `Phí đường bộ`, theo `Thang tinh` |
| 13 | Loi nhuan gop | Doanh thu - thue - dau - phi duong bo |
| 14 | Chi quy thuc te | Chi tien that theo ngay, loai dau/thue, cong them dau do ngoai noi dung Quy |
| 15 | Loi nhuan thuc | Loi nhuan gop - chi quy thuc te |

Cong thuc/logic quan trong:

- Tong khoi luong:
  - Tong: `SUMIFS(XL_VanChuyen!F:F, XL_VanChuyen!B:B, $B$1)`
  - Quang Quan/Minh Vuong them dieu kien `XL_VanChuyen!M:M`.
- Tong doanh thu:
  - Tong: `SUMIFS(XL_VanChuyen!L:L, XL_VanChuyen!B:B, $B$1)`.
- Thue:
  - VAT rate: `XLOOKUP("THUE_VAT_RATE", DM_ThamSo!A:A, DM_ThamSo!C:C, 0.08)`.
  - TNDN rate: `XLOOKUP("THUE_TNDN_RATE", DM_ThamSo!A:A, DM_ThamSo!C:C, 0.1)`.
- Dau Quang Minh:
  - Loc `NL_Dau!D:D` match `quang minh|công ty|cong ty`.
  - Tach cong ty bang bien so xe -> `DM_Xe!F:F`.
- Dau do ngoai QQ/MV:
  - Loc `NL_Dau!D:D` match `đổ ngoài|do ngoai`.
  - Ghi chu `NL_Dau!H:H` match `quang quân|quang quan|minh vương|minh vuong`.
- Chi quy thuc te:
  - Lay `IMP_ThuChi!D:D` theo `Ngay` trong thang (`IMP_ThuChi!B:B >= t`, `<= EOMONTH(t,0)`).
  - Loai dong `Cong no = Có`.
  - Loai cac chuoi lien quan: `góp quỹ`, `xăng dầu/dầu`, `thuế doanh nghiệp`, `thuế TNDN`, `thuế VAT`, `VAT`.
  - Cong them `NL_Dau` nguon do ngoai, ghi chu `Quỹ/Quy`.

Bang thang ben phai `Bang_21` da duoc dua xuong cung hang quan sat voi bang chi tiet. Cac cot:

| Cot | Ten |
| --- | --- |
| G | Thang |
| H | Tong khoi luong |
| I | Tong doanh thu |
| J | Thue TNDN |
| K | Thue VAT |
| L | Dau Quang Minh |
| M | Dau do ngoai QQ/MV |
| N | Phi duong bo |
| O | Loi nhuan gop |
| P | Chi quy thuc te |
| Q | Tong cuoi |

### `BC_BangLuong`

Cot:

| Cot | Ten |
| --- | --- |
| A | Thang |
| B | Nhan su |
| C | Chuc vu |
| D | So chuyen |
| E | Luong chuyen |
| F | Luong cung thuc |
| G | Nghi phep |
| H | Ngay bi tru |
| I | Thuong |
| J | Tong luong |
| K | Ung luong |
| L | Phat |
| M | Thuc nhan |
| N | Ghi chu |

Logic:

- Lay du lieu tu `XL_LuongNhanSu`.
- Co `SUBTOTAL` o dong 1 de tong khi filter.
- Ung luong dung `IMP_ThuChi!G:G` la `Thang tinh`, khong dung ngay chi tien that. Ly do: ung luong ngay 02/06 nhung noi dung `T5` phai khau tru vao bang luong thang 5.
- Thuong tuyen lai/thuong quan ly can kiem tra o `XL_ThuongQuanLy` va `XL_LuongNhanSu!Q:Q` neu khong hien thi.

### `BC_TongHopXe`

Cot:

| Cot | Ten |
| --- | --- |
| A | Thang |
| B | Cong ty |
| C | Bien so |
| D | So chuyen |
| E | Tong khoi |
| F | Doanh thu uoc tinh |
| G | Dau lit |
| H | Tien dau |
| I | Chi phi sua chua |
| J | Tong chi phi |
| K | Lai gop truoc luong |
| L | Ghi chu |

Logic:

- A:F query tu `XL_VanChuyen`.
- G:H tong dau theo `NL_Dau` thang/xe.
- I chi phi xe tu `IMP_ThuChi`, loai tinh `Chi phí xe`, noi dung/nha cung cap co bien so xe.
- J = tien dau + chi phi sua chua.
- K = doanh thu - tong chi phi.

## 8. Nhung Quyet Dinh Logic Da Chot

### Tach nghiep vu va dong tien that

- `Thang tinh` trong `IMP_ThuChi` dung cho nghiep vu: bang luong, ung luong, phan bo chi phi theo noi dung `T5/T6`.
- `Ngay` trong `IMP_ThuChi` dung cho dong tien that: `Chi quy thuc te` trong `BC_TongQuan`.

### Cong no

- Dong phat sinh co `Cong no = Có` khong tinh vao chi quy thuc te.
- Khi co dong tat toan sau nay, dong tat toan duoc tinh vao thang chi tien that.

### Dau

- Dau nguon Quang Minh/Cong ty tinh rieng trong `BC_TongQuan`.
- Dau do ngoai co noi dung Quang Quan/Minh Vuong tinh rieng thanh dong chi phi dau do ngoai.
- Dau do ngoai co noi dung Quy/Quỹ khong nam trong dau QQ/MV, ma cong vao chi quy thuc te.

### Lui KPI

- `NL_NghiVanHanh!H:H` la so chuyen KPI bi giam.
- Tai xe:
  - `XL_LuongTheoXe` dung nghi KPI de tinh chi tieu sau nghi va bac don gia.
- Quan ly:
  - `XL_ThuongQuanLy` da ap dung lui KPI cho moc 140 va 168.

## 9. Web App Apps Script

Thu muc code web app gom:

| File | Vai tro |
| --- | --- |
| `Code.gs` | Cau hinh spreadsheet, router web app, API `getInitialData`, `getReports`, `submitRows` |
| `SheetService.gs` | Doc danh muc, doc bao cao, append du lieu vao `NL_*`, format dong moi |
| `ValidationService.gs` | Validate va chuan hoa du lieu truoc khi ghi |
| `Index.html` | Giao dien mobile-first/web app |
| `appsscript.json` | Manifest Apps Script |
| `.clasp.json` | Lien ket local folder voi Apps Script project |

Manifest hien tai:

```json
{
  "timeZone": "Asia/Saigon",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets"],
  "webapp": {
    "access": "MYSELF",
    "executeAs": "USER_DEPLOYING"
  }
}
```

### API

`Code.gs`:

- `doGet(e)`: tra giao dien `Index.html`.
- `getInitialData()`: goi `SheetService.getInitialData()`.
- `getReports(forceRefresh)`: goi `SheetService.getReports(forceRefresh)`.
- `submitRows(formType, rows)`: goi `SheetService.submitRows(formType, rows)`.

### Form type va sheet dich

| Form type | Sheet dich | Header row | So cot ghi |
| --- | --- | --- | --- |
| `vanChuyen` | `NL_VanChuyen` | 2 | 7 |
| `taiXe` | `NL_TaiXe` | 1 | 6 |
| `dau` | `NL_Dau` | 2 | 8 |
| `chamCong` | `NL_ChamCong` | 1 | 9 |
| `phat` | `NL_Phat` | 1 | 7 |
| `nghiVanHanh` | `NL_NghiVanHanh` | 1 | 9 |

### Cach ghi du lieu

- Web app chi ghi vao cac sheet `NL_*`.
- Khong ghi vao `XL_*`, `BC_*`, `DM_*`.
- Khi submit:
  - Lay lock `LockService.getScriptLock()`.
  - Validate tung dong.
  - Tim dong append bang cot A va header row.
  - Neu thieu dong thi `insertRowsAfter`.
  - `setValues` vao dung so cot.
  - Dinh dang ngay/thang/so tien.
  - Xoa cache bao cao `reports:v3`.

### Cache bao cao

- `getReports(forceRefresh)` dung `CacheService`.
- Cache key: `reports:v3`.
- TTL: 180 giay.
- Bao cao doc:
  - `BC_TongQuan`
  - `BC_BangLuong`
  - `BC_TongHopXe`
  - thong ke so dong moi nhat cac `NL_*`.

### Validation trong web app

- `vanChuyen`: bat buoc ngay, xe, du an, so chuyen > 0.
- `taiXe`: bat buoc ngay, xe, tai xe, so chuyen > 0.
- `dau`: bat buoc ngay, xe, nguon dau, so lit > 0, gia dau > 0; thanh tien = so lit * gia dau.
- `chamCong`: bat buoc tu ngay, den ngay, nhan su, loai ngay cong; den ngay >= tu ngay; so ngay tinh inclusive.
- `phat`: bat buoc ngay, nhan su, ma phat; noi dung/so tien lay tu `DM_PhatNoiBo`.
- `nghiVanHanh`: bat buoc ngay, xe, du an, loai nghi, so gio nghi > 0; neu tinh KPI thi giam KPI = gio / tham so.

### Giao dien

- Web app da co:
  - sidebar desktop,
  - menu/drawer mobile,
  - bottom nav mobile,
  - dashboard/report panels,
  - form nhap lieu nhieu dong,
  - nut them dong/nhan ban/xoa/gui.
- Giao dien van con la V1 va can tiep tuc cai tien ve dashboard, toc do load va UX mobile.

## 10. Diem Can Luu Y Khi Phat Trien Tiep

1. Khong sua truc tiep cong thuc trong `XL_*` va `BC_*` neu chua export/backup.
2. Neu them cot vao `NL_*`, phai sua ca:
   - header trong sheet,
   - `APP_CONFIG.sheets`,
   - `ValidationService.build...`,
   - `SheetService.applyFormats_`,
   - cong thuc `XL_*` lien quan.
3. Neu web app cham:
   - giam so dong doc trong `getReports`,
   - tach endpoint report theo tung man hinh,
   - tang cache,
   - khong doc bang luong/tong hop xe day du khi chi vao man hinh nhap lieu.
4. Neu muon chia cho co dong chi xem bao cao:
   - nen tao mode read-only trong web app,
   - hoac tao deployment rieng,
   - khong cap quyen edit spreadsheet neu khong can.
5. Neu muon lam app mobile tot hon:
   - giu Apps Script web app,
   - them PWA manifest/service worker neu dieu kien Apps Script cho phep,
   - toi uu UI theo AppSheet: action lon, form ngan, dashboard filter theo thang.
6. Neu tiep tuc sua `BC_TongQuan`, can giu 2 lop:
   - loi nhuan gop/lai van hanh theo nghiep vu,
   - chi quy thuc te theo dong tien.

## 11. Trang Thai Gan Nhat

Da thuc hien:

- Doi `BC_TongQuan` de tach:
  - tong/doanh thu/thue theo `Quang Quan` va `Minh Vuong`,
  - dau nguon Quang Minh theo cong ty,
  - dau do ngoai QQ/MV theo noi dung `NL_Dau`,
  - chi quy thuc te theo ngay chi tien, loai dau/thue, cong dau do ngoai noi dung Quy.
- Dua `Bang_21` xuong cung vung quan sat voi bang chi tiet.
- Ap dung lui KPI cho thuong quan ly tai moc 140 va 168.
- Tao web app V1 gan voi spreadsheet, chi append vao `NL_*`.
- Da xoa endpoint tam dung de patch sheet; code hien tai khong con endpoint admin tam.

Can kiem tra tiep neu co thoi gian:

- Thuong tuyen lai trong `BC_BangLuong` co hien dung khong.
- `XL_NgoaiLe` co can rut gon cot phu/hidden hay khong.
- Cac bang co tu mo rong cong thuc khi du lieu vuot qua vung 1000/5000/50500 dong hay khong.
- Web app mobile can tiep tuc toi uu toc do load va giao dien dashboard.

## 12. Nguyen Tac An Toan Khi Xay Web App Tiep

Day la phan bat buoc can dua cho bat ky AI/dev nao tiep tuc lam viec. Muc tieu la tranh viec web app ghi sai sheet, ghi de cong thuc, hoac lam hong file chinh.

### 12.1. Cac sheet duoc phep ghi tu web app

Web app chi duoc append du lieu vao cac sheet nhap lieu sau:

| Sheet | Duoc ghi? | Cach ghi an toan |
| --- | --- | --- |
| `NL_VanChuyen` | Co | Append dong moi sau dong du lieu cuoi, A:G |
| `NL_TaiXe` | Co | Append dong moi sau dong du lieu cuoi, A:F |
| `NL_Dau` | Co | Append dong moi sau dong du lieu cuoi, A:H |
| `NL_ChamCong` | Co | Append dong moi sau dong du lieu cuoi, A:I |
| `NL_Phat` | Co | Append dong moi sau dong du lieu cuoi, A:G |
| `NL_NghiVanHanh` | Co | Append dong moi sau dong du lieu cuoi, A:I |

Khong duoc ghi truc tiep vao:

| Nhom | Sheet | Ly do |
| --- | --- | --- |
| `XL_*` | Tat ca sheet xu ly | Chua cong thuc spill/array, ghi vao co the pha cong thuc |
| `BC_*` | Tat ca sheet bao cao | La dau ra bao cao, khong phai dau vao |
| `DM_*` | Danh muc/tham so | Chi sua co chu dich, can validation rieng |
| `IMP_ThuChi` | Import thu chi | Dang lay tu file ThuChi rieng, khong phai dau vao cua web app VanTai |

Neu muon web app co man hinh sua danh muc, nen tao luong rieng co xac nhan va log thay doi, khong tron voi form nhap lieu hang ngay.

### 12.2. Cach tim dong append an toan

Khong dung `sheet.getLastRow()` mot cach may moc vi cac sheet co cong thuc/format/data validation keo dai xuong duoi. Cach an toan hien dang dung trong `SheetService.gs`:

1. Xac dinh `headerRow`.
2. Quet cot A tu duoi len theo chunk 1000 dong.
3. Tim dong cuoi co gia tri o cot A.
4. Append tai dong ke tiep.

Ly do: cot A cua cac `NL_*` deu la ngay/chung tu bat buoc, nen phu hop lam cot neo.

### 12.3. Nhung cot web app tu tinh, khong nen bat nguoi dung nhap tay

| Sheet | Cot tu tinh | Quy tac |
| --- | --- | --- |
| `NL_VanChuyen` | `Thang` | Lay ngay dau thang tu `Ngay` |
| `NL_TaiXe` | `Thang` | Lay ngay dau thang tu `Ngay` |
| `NL_Dau` | `Thang`, `Thanh tien` | `Thang = DATE(YEAR(Ngay),MONTH(Ngay),1)`, `Thanh tien = So lit * Gia dau` |
| `NL_ChamCong` | `Thang`, `So ngay`, `Tinh luong cung`, `Nhom xu ly` | Theo loai ngay cong |
| `NL_Phat` | `Thang`, `Noi dung phat`, `So tien phat` | Tra cuu `DM_PhatNoiBo` |
| `NL_NghiVanHanh` | `Thang`, `Giam KPI` | `So gio nghi / SO_GIO_1_CHUYEN_KPI`, neu `Tinh KPI? = Có` |

### 12.4. Cac quy tac khong duoc lam sai

1. `IMP_ThuChi!G:G` la `Thang tinh`, dung cho nghiep vu nhu bang luong, ung luong, phan bo `T5/T6`.
2. `IMP_ThuChi!B:B` la `Ngay`, dung cho dong tien that va `Chi quy thuc te`.
3. Dong cong no ban dau co `Cong no = Có` khong tinh vao chi quy thuc te.
4. Dong tat toan cong no tinh vao thang cua ngay tat toan.
5. Dau do ngoai ghi chu `Quỹ/Quy` cong vao chi quy, khong dua vao dau QQ/MV.
6. Dau do ngoai ghi chu `Quang Quân/Quang Quan` hoac `Minh Vương/Minh Vuong` tinh vao dong dau do ngoai cua tung cong ty.
7. KPI nghi van hanh ap dung cho ca tai xe va quan ly.
8. Ung luong ngay thang sau nhung noi dung `T5` van phai tru vao bang luong thang 5.

## 13. Ban Do Phu Thuoc Cong Thuc

Phan nay ghi ro sheet nao phu thuoc sheet nao de tranh sua nham.

| Dau ra | Phu thuoc truc tiep |
| --- | --- |
| `XL_DoiSoatChuyen` | `NL_VanChuyen`, `NL_TaiXe` |
| `XL_VanChuyen` | `NL_VanChuyen`, `DM_Xe`, `DM_DuAn`, `DM_ThamSo`, `DM_DonGiaVanChuyen` |
| `XL_LuongTheoXe` | `NL_TaiXe`, `NL_NghiVanHanh`, `DM_LuongChuyen`, `DM_ThamSo`, `XL_NgoaiLe` |
| `XL_NgoaiLe` | `NL_TaiXe`, `DM_PhanCongLaiXe`, `DM_LuongChuyen`, logic thieu lai/dieu chinh |
| `XL_ThuongQuanLy` | `XL_LuongTheoXe`, `NL_NghiVanHanh`, `DM_ThuongQuanLy`, `DM_NhanSu`, `NL_ChamCong` |
| `XL_LuongNhanSu` | `DM_NhanSu`, `XL_LuongTheoXe`, `XL_ThuongQuanLy`, `NL_ChamCong`, `NL_Phat`, `IMP_ThuChi` |
| `BC_TongQuan` | `XL_VanChuyen`, `NL_Dau`, `IMP_ThuChi`, `DM_ThamSo`, `DM_Xe` |
| `BC_BangLuong` | `XL_LuongNhanSu` |
| `BC_TongHopXe` | `XL_VanChuyen`, `NL_Dau`, `IMP_ThuChi` |

## 14. Cac Vung Co Nguy Co Lam Cham File

File hien tai co dau hieu cham, dac biet tren dien thoai. Nguyen nhan kha ro:

1. Nhieu sheet co cong thuc keo den 1000, 5000, 50500 dong.
2. Nhieu cong thuc dung nguyen cot `A:A`, `B:B`, `D:D` trong `SUMIFS`, `FILTER`, `MAP`.
3. `IMP_ThuChi` dung `IMPORTRANGE` tu file khac, nen moi lan tinh lai co the cham.
4. Cac sheet `XL_*` tinh toan trung gian bang cong thuc spill rong.
5. Google Sheets tren dien thoai xu ly bang lon, protected range, filter view, data validation cham hon desktop.
6. Web app neu doc toan bo report cung se cham vi phai lay nhieu vung bao cao mot lan.

### 14.1. Cac sheet/vung lon theo ban export gan nhat

| Sheet | So dong export | So cot export | Ghi chu |
| --- | ---: | ---: | --- |
| `NL_VanChuyen` | 50443 | 7 | Vung nhap lieu rat lon |
| `NL_Dau` | 50485 | 27 | Nhap lieu A:H, nhung export thay toi AA do format/validation/phu |
| `XL_DoiSoatChuyen` | 50500 | 12 | Xu ly theo `NL_VanChuyen` |
| `XL_VanChuyen` | 50500 | 19 | Tinh doanh thu, don gia, cong ty |
| `XL_LuongTheoXe` | 5000 | 20 | Tinh luong theo xe/tai xe |
| `XL_LuongNhanSu` | 5000 | 21 | Tinh bang luong nhan su |
| `XL_NgoaiLe` | 5000 | 25 | Nhieu cot phu, can can nhac rut gon |
| `XL_ThuongQuanLy` | 5000 | 9 | Tinh thuong quan ly |
| `BC_TongQuan` | 200 | 17 | Nhe hon, nhung phu thuoc nhieu vung lon |

## 15. De Xuat Toi Uu File

### 15.1. Huong toi uu an toan nhat

Giu Google Sheet la database va cong thuc goc, nhung giam thao tac truc tiep tren mobile:

1. Nhap lieu hang ngay bang web app.
2. Xem dashboard bang web app.
3. Chi vao Google Sheet khi can sua cau truc, doi soat sau, hoac phan tich sau.

Day la huong phu hop nhat vi ban dang thay Google Sheet cham tren dien thoai.

### 15.2. Toi uu cong thuc trong Google Sheet

Nen lam theo thu tu:

1. Rut gon vung tinh tu 50500 dong ve muc thuc te + du phong, vi hien du lieu moi khoang vai tram dong.
2. Han che cong thuc nguyen cot trong sheet tinh nang nang:
   - Thay `A:A` bang `A2:A5000` neu du.
   - Voi `NL_VanChuyen`, neu can du phong cao thi dung 10000 truoc, khong can 50500 ngay.
3. Tach `IMP_ThuChi` thanh import thuan va xu ly thang/loai tinh rieng neu cong thuc import qua dai.
4. Giam so cot phu trong `XL_NgoaiLe` neu cac cot do khong con can thiet.
5. Chuyen mot so tinh toan nang sang Apps Script cache theo thang neu khong can realtime tung giay.
6. Tao sheet `CFG_App` hoac `SYS_Config` de luu cau hinh web app, thay vi hard-code qua nhieu cho.

### 15.3. Toi uu rieng cho web app

Hien web app V1 doc bao cao tong quan, bang luong, tong hop xe, input stats trong mot goi `getReports`. Neu cham, nen doi thanh:

| Endpoint moi | Doc gi | Khi nao goi |
| --- | --- | --- |
| `getDashboard(month)` | KPI tong quan 1 thang | Khi mo dashboard |
| `getPayroll(month)` | Bang luong 1 thang | Khi vao tab bang luong |
| `getVehicles(month)` | Tong hop xe 1 thang | Khi vao tab xe |
| `getInputStats()` | So dong va ngay moi nhat | Khi vao trang nhap lieu |
| `getCatalogs()` | Danh muc xe/nhan su/du an | Khi vao form nhap |

Khong nen tai tat ca bao cao khi nguoi dung chi muon nhap mot dong dau hoac chuyen.

### 15.4. Nen co log nhap lieu

De tranh tranh chap khi web app ghi sai:

- Tao sheet `SYS_LogNhapLieu`.
- Moi lan submit ghi:
  - timestamp,
  - email user,
  - formType,
  - sheet dich,
  - startRow,
  - inserted count,
  - payload JSON rut gon,
  - ket qua validate.

Sheet log nay khong anh huong cong thuc chinh nhung giup rollback/kiem tra.

### 15.5. Nen co trang staging/test

Truoc khi sua cong thuc lon:

1. Copy file Google Sheet thanh ban test.
2. Tro Apps Script/web app test vao spreadsheet ID test.
3. Nhap thu 2-3 dong moi loai.
4. So sanh `BC_TongQuan`, `BC_BangLuong`, `BC_TongHopXe`.
5. Chi khi dung moi cap nhat file chinh.

### 15.6. Nen tach "database" va "bao cao nang" ve lau dai

Neu file tiep tuc lon:

- File 1: `VanTaiDongBac_Data_2026` chi chua `NL_*`, `DM_*`, `IMP_ThuChi`.
- File 2: `VanTaiDongBac_Report_2026` chua `XL_*`, `BC_*`, import du lieu da can.
- Web app ghi vao File 1, doc dashboard tu cache/summary.

Tuy nhien chua nen tach ngay neu ban can on dinh. Truoc mat nen toi uu vung cong thuc va web app.

## 16. Checklist Bat Buoc Truoc Khi Sua File Chinh

Truoc moi thay doi cong thuc/cau truc:

1. Ghi ro sheet/range se sua.
2. Export hoac copy backup file.
3. Kiem tra sheet co protected range/table/filter khong.
4. Doc header that cua sheet.
5. Doc 3-5 dong du lieu mau.
6. Neu sua cong thuc, test o o helper truoc.
7. Khong xoa cot/dong phu neu chua biet cong thuc nao dang tham chieu.
8. Sau khi sua, kiem tra toi thieu:
   - `BC_TongQuan`
   - `BC_BangLuong`
   - `BC_TongHopXe`
   - 1 dong nhap moi trong moi `NL_*` lien quan.

## 17. Checklist Bat Buoc Truoc Khi Sua Web App

1. Kiem tra `Code.gs` co dung spreadsheet ID file chinh hay file test.
2. Neu dang test, khong deploy de nguoi dung that dung nham.
3. Neu them/sua form, kiem tra:
   - ten field trong HTML,
   - `ValidationService`,
   - `APP_CONFIG.sheets`,
   - so cot append,
   - dinh dang sau append.
4. Khong them endpoint admin tam vao deployment san xuat.
5. Neu bat buoc dung endpoint tam de patch sheet:
   - dat token kho doan,
   - chay xong phai xoa,
   - `clasp push`,
   - tao version moi,
   - redeploy tat ca deployment ve version khong co endpoint tam.

## 18. Goi Y Lo Trinh Tiep Theo

### Buoc 1: Dong bang cau truc sheet hien tai

Tao mot ban "schema registry" trong markdown hoac sheet `SYS_Schema`:

- sheet name,
- cot,
- kieu du lieu,
- nguon nhap/web app/cong thuc,
- co duoc web app ghi khong,
- cong thuc phu thuoc.

Tai lieu nay da la ban dau tien, nhung neu muon an toan hon, nen tao them `SYS_Schema` trong file test.

### Buoc 2: Lam web app thanh cong cu nhap lieu chinh

Tap trung vao:

- man hinh nhap nhanh tren dien thoai,
- danh muc dropdown de tranh sai chinh ta,
- clone dong gan nhat,
- validate truoc khi ghi,
- log sau khi ghi.

### Buoc 3: Dashboard theo thang

Dashboard nen co filter thang mac dinh la thang hien tai:

- doanh thu,
- khoi luong,
- dau,
- chi quy,
- loi nhuan thuc,
- bang luong,
- tong hop xe,
- canh bao doi soat chuyen.

Khong nen load tat ca thang ngay khi mo web app tren mobile.

### Buoc 4: Toi uu Google Sheet

Lam sau khi web app nhap lieu on:

- giam vung cong thuc,
- giam `IMPORTRANGE`,
- rut gon `XL_NgoaiLe`,
- tao cache monthly summary bang Apps Script neu can.

### Buoc 5: Phan quyen

Vi nhu cau chu yeu la 1 nguoi nhap va 2-3 co dong xem:

- Ban quan ly: co quyen nhap/sua.
- Co dong: chi xem dashboard/report.
- Neu dung chung web app, can check email de an nut nhap lieu voi nguoi chi xem.

