# ROLLBACK

## 1. Nguyên tắc

- Rollback presentation bằng deployment Vercel bất biến đã lưu; không rebuild source cũ.
- Rollback Apps Script bằng version còn lưu trên đúng production deployment ID; không tạo URL mới tùy ý.
- Google Sheets là source of truth. Không rollback bằng cách restore toàn workbook nếu có thể ghi đè dữ liệu nghiệp vụ mới.
- Migration Supabase đã chạy là bất biến; rollback ưu tiên code/feature flag hoặc migration mới.
- Mọi rollback production cần phê duyệt rõ, trừ tình huống đang trong chính cửa sổ cutover đã được phê duyệt và gate bắt buộc thất bại.

## 2. Baseline rollback hiện hành

Production đã xác nhận trong `PROJECT_CONTEXT.md`:

- Vercel hiện tại: `dpl_7rphNyrL2aUVGU5FKFZbVARDS2GU`.
- Vercel rollback gần nhất: `dpl_By46eeK9wbaq4YCMqdEZZLPbXxM1`; rollback lịch sử tiếp theo là `dpl_KKHYYKKT8g5M6L5T44i9vN3CywoR`, `dpl_CogE124n97QyuRL8QSW4tCpcKYmv`, `dpl_C7ovMrnmLjveFr6soZQijTtLcmba`, `dpl_9TNAVm9ifWXWxKx5Knzw57j8Vkio`, `dpl_85PsF73o52beq8SuKrK8915nzu4f`, `dpl_4LQnv87HMgV96P5rVvc2m83WDhK2`, `dpl_8WEdJbFi6H1FVhTW7pVCZ2AXob2q`, rồi `dpl_A4CfP4ThTzsvwHTQ5wVm3whwDUCG`.
- Rollback lịch sử tiếp theo: D1 `dpl_AnCbeEiqX6fqHPXGj3DLce8sT7Zx`, C3 `dpl_FnaSmXyssVG8xE6yhuzBG63vTdBF`, C2 `dpl_Bz2g66qFuPMcKkRriQgWbxCsNSFg` nếu vẫn READY.
- Apps Script production: code version `@348`; rollback gần nhất cùng deployment ID là `@344`, tiếp theo là `@343`, `@340`, `@338`, `@337`, `@335`, `@328`, `@325`, rồi `@322`.
- Kênh notification dispatch có thể được cô lập ngay bằng Script Property `NOTIFICATION_DISPATCH_ENABLED=false` mà không rollback toàn bộ webapp.
- Recovery deployment `@281` đã undeploy, không dùng.

Luôn xác minh live deployment ID trước thao tác; không giả định các ID trên còn READY nếu thời gian đã trôi qua.

## 3. Vercel rollback

1. Ghi lại deployment ID và health fingerprint hiện tại.
2. Xác minh target rollback READY và có đúng Production environment.
3. Chỉ đổi alias `dongbac.vercel.app` trong checkpoint rollback được phê duyệt.
4. Smoke root, routes, session 401, manifest/service worker và health.
5. Authenticated smoke module bị ảnh hưởng.
6. Kiểm tra log 5xx và fingerprint.
7. Ghi kết quả vào `PROJECT_CONTEXT.md`.

Không sửa alias Preview để chữa Production và không promote deployment đóng gói Apps Script Preview sang Production.

## 4. Apps Script rollback

1. Xác minh production deployment ID canonical.
2. Update cùng deployment đó về code version rollback đã lưu.
3. Chờ propagation rồi kiểm tra direct health nhiều lần.
4. Kiểm tra health qua Vercel và fingerprint đúng deployment production.
5. Không dùng `@HEAD` hoặc tạo deployment ID mới nếu chưa được phê duyệt.

HTTP 403 có thể là `deployment_access_denied`, không mặc định là OAuth. Nếu gặp lại, chạy `diagnoseSyncAuthorization()` bằng đúng owner/deployer rồi xác minh authorization status, live execute-as/access và Executions; không chữa bằng cách đổi production alias hoặc dùng Preview endpoint.

## 5. `SYS_ReportCache` retirement

Tab đã retired bằng migration có guard. Không tạo lại thủ công.

Nếu cần điều tra/restore:

1. có phê duyệt restore riêng;
2. xác minh backup file ID và fingerprint trong `PROJECT_CONTEXT.md`;
3. chạy dry-run restore của `ReportCacheRetirementMigration.gs`;
4. xác minh workbook live chưa drift và Supabase exact-version gate;
5. dùng one-shot approval;
6. hậu kiểm tên/ID/thứ tự/công thức và Report parity.

Không restore toàn workbook vì có thể ghi đè dữ liệu nghiệp vụ phát sinh sau backup.

## 6. Supabase/cache/queue

- Không xóa migration `001–013` hoặc sửa migration đã apply.
- Nếu read cache lỗi, ưu tiên rollback runtime/candidate; Google Sheets vẫn là nguồn đối soát.
- Không retry hàng loạt write jobs khi chưa biết job nào đã ghi Sheet; dùng exact job ID/idempotency marker.
- Queue cleanup phải scope đúng project canonical và lưu bằng chứng trước/sau.
- Cron cảnh báo Quỹ cũ rollback bằng tắt `FUND_LOW_BALANCE_ALERT_ENABLED`. Pipeline đa nguồn rollback tức thời bằng Script Property `NOTIFICATION_DISPATCH_ENABLED=false`; không xóa subscription, preference, baseline hoặc rule state.

## 7. Data rollback

- Không xóa dòng vật lý trong các sheet có formula/helper/bảng phụ; Vận hành dùng clear-only đúng business columns.
- Trước data migration destructive: backup riêng, dry-run, fingerprint, exact target và one-shot approval.
- Sau rollback: đối chiếu Sheet, Supabase bundle, queue và UI authenticated.

## 8. Trạng thái tài liệu

- Loại: `CURRENT` rollback runbook.
- Ngày hệ thống lại: 2026-08-10.
- Deployment/source hiện hành: `PROJECT_CONTEXT.md`.
