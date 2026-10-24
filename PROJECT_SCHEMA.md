# PROJECT_SCHEMA

Schema index; không sao chép header/mapping đầy đủ. Current state thuộc [context](PROJECT_CONTEXT.md). Source/live được xác minh có ưu tiên hơn snapshot cũ. Cập nhật 2026-10-22.

## Nguồn và invariant

- Backend standalone resolve workbook/year, `SpreadsheetApp.openById(id)`; không dùng active spreadsheet làm dữ liệu chính.
- Vận tải và Thu chi là hai workbook độc lập theo năm; không gộp, rename sheet, reorder column hoặc xóa công thức/named range.
- Thay schema phải migration riêng với backup/dry-run/fingerprint/approval, snapshot mới; migration/snapshot lịch sử bất biến.
- Candidate nhiều năm dùng migration019 để namespace cache/queue và migration020 cho `workbook_contexts`/`workbook_rollover_runs`; registry chỉ giữ exact ID/lifecycle/audit server-side, không chứa hoặc thay thế dữ liệu nghiệp vụ Sheet. [Runbook chuyển năm](docs/operations/YEAR_ROLLOVER.md).

## Vận tải

Workbook 2026: `1VSNLzSNKJFXaY_dcyM7WkPz9Braia0AjPM7jHHXXyeA`.

| Nhóm | Owner chi tiết |
|---|---|
| Nhập liệu `NL_*`, danh mục `DM_*`, vận hành | [Spreadsheet contracts](docs/contracts/SPREADSHEET_CONTRACTS.md), `SheetService`/`ValidationService`/row builders |
| Xử lý `XL_*`, tổng hợp `SYS_*`, báo cáo `BC_*` | Cùng contract, `ReportService`/`ReportSyncService` |
| Payroll và lịch sử đợt `DM_LichSuNhanSu`/`SYS_AggThuongTuyen` | [Payroll contract](docs/contracts/PAYROLL_EXPLANATION_CONTRACT.md), `PayrollExplanationService` |
| Report cache Supabase; `SYS_ReportCache` đã retired | [Cache contract](docs/contracts/CACHE_AND_QUEUE_CONTRACTS.md), [rollback](ROLLBACK.md) |

Input groups: vận chuyển, dầu, tài xế, nghỉ vận hành, chấm công, phạt nội bộ, ngoại lệ và chi phí xe; exact editable fields do registry/source/live headers sở hữu. Không suy ra cột vật lý từ số trường của form.

## Thu chi

Workbook 2026: `1PWwGC6HCdskiV2fEZjDFiAt6kA_nsx64twrVTgrRerw`.

- `NHAP_THUCHI`: voucher A, ngày B, mục Thu C/Chi D, hình thức E, tiền F, người G, đối tác H, nội dung I, công nợ J; K workbook-owned, L không qua Quỹ, M dư nợ, N helper spill N2. Exact mapping/aliases thuộc FundTransactionService và Spreadsheet contract.
- `NHAP_VAY`: A:L business; M/N và helpers workbook-owned. Loan/payment/type/nonFund và reconciliation thuộc FundLoanService.
- `CAIDAT` và native named ranges: FundCatalogRepository/Service; settings named ranges như TMDK/TKDK/NGAYNHAPLIEU/NGAYTINHVAY không được rename.
- Writer chỉ ghi transaction A:J/L và note intent ở voucher cell; không thêm cột. Loan append không tự sửa filter. Live baseline/triển khai khác nhau phải theo context/R8 runbook.
- Bound script là execution context riêng, có thể ghi trực tiếp ngoài web RBAC. [Bound contract/source](docs/legacy/THU_CHI_BOUND_SCRIPT.md) là reference; cần xác minh runtime khi điều tra tác nhân ghi.

## Snapshot và drift

[Schema snapshot directory](docs/schema/) chứa bằng chứng có thời điểm; ưu tiên `live_schema_audit_20260910.json` khi so với baseline cũ, rồi xác minh live nếu có dấu hiệu drift. R8 audit đọc live thấy lịch sử nhân sự và helper SYS_CALC mới; không tự sửa snapshot 20260910 thành live 20261003.

- Cột vật lý có thể dài hơn row builder/helper width.
- `DM_PhanCongLaiXe`/`XL_NgoaiLe` từng drift; đọc aliases/source/headers hiện hành trước write.
- Timezone workbook Asia/Saigon và backend Asia/Ho_Chi_Minh đều UTC+7; không đổi timezone như một sửa lỗi ngầm.
- Snapshot bound source có thể khác deployment; không coi thiếu source bot là bằng chứng bot không tồn tại.

Supabase schema/migrations/grants: [SUPABASE_SCHEMA](SUPABASE_SCHEMA.md). API/form mapping: [API contract](docs/contracts/API_CONTRACTS.md), [business form contract](docs/contracts/BUSINESS_FORM_SHEET_CONTRACT.md).
