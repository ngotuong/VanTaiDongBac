# D5 Sync rollout

> D5 ngày 09/11 và D5D ngày 10/11 đều đã fail và rollback. D5E sửa exact-month.
> D5F ngày 11/11 đã terminalize exact generation D5D bằng migration 027, đưa
> Apps Script Production 434→443 và chạy đúng một canary PASS trong 66,832 giây.
> D5G cùng ngày đã mở một safety window gần 10 phút không tạo dữ liệu giả;
> không có job/generation/invalidation mới và không kéo backlog cũ. Helper đã
> dọn sạch, ba flag đã tắt lại. D5H sau đó chạy một controlled UI canary qua
> Google Sheets, PASS trong 46,574–53,684 giây và đã dọn sạch. Chỉ còn D5I
> bật foreground thường trực có giám sát, cần phê duyệt riêng.

## Boundary

D5 mở foreground publication cho đúng workbook Vận tải hiện hành trong cửa sổ
30 phút. Background publisher vẫn là fallback. Không đổi workbook Thu chi, tên
sheet, thứ tự cột hoặc công thức.

## Preconditions

- migrations 001–027 PASS và migrations 026–027 đã apply vào project canonical;
- có đúng một time-driven trigger `reconcileSyncGenerationShadow`; activation
  fail-closed trước khi ghi flag nếu thiếu hoặc trùng trigger;
- tối thiểu 30 copy-canary hợp lệ đạt `p95 <= 90 giây`, `p99 <= 120 giây`;
- full gate test/SQL/lint/typecheck/build/audit/diff-check PASS;
- Apps Script/Vercel rollback identities đã ghi nhận;
- Production canary và cleanup exact-cell đã được phê duyệt.

## Activation

1. Xác nhận ba flag đang false, allowlist rỗng và audience là `preview` bằng
   `getSyncGenerationRolloutStatus`.
2. Deploy paired Apps Script/Vercel candidate với flag vẫn tắt.
3. Chạy `activateSyncGenerationProductionCanary`. Hàm chỉ allowlist workbook
   Vận tải đang active, đặt audience `production` và expiry sau 30 phút.
4. Chạy đúng một canary; xác minh generation `published`, đúng một invalidation
   Production và đúng hai bundle cùng generation/publication/timestamp.
5. Cleanup đúng ô test; giữ generation metadata làm audit. Nếu có orphan phải
   dùng RPC quarantine với exact `event_key` trong checkpoint riêng, không xóa
   dòng metadata, dòng Sheet hoặc công thức.

## D5F result

- window: 14:51:33–14:54:07 ICT ngày 11/11/2026;
- canary: `D5F-PROD-20261111-1450`, job `web-18b9040c09a08fb92682f7b93e97f86bd564cf0b`;
- source commit: `2026-11-11T07:52:31.002148Z`;
- atomic publish: `2026-11-11T07:53:37.834Z`, latency 66,832 giây;
- pair: `11/2026` + `__dashboard_latest__`, publication ID 32, một Production invalidation;
- cleanup: clear exact `NL_VanChuyen!A1445,C1445:F1445,H1445`, giữ công thức B/G; read model sạch;
- final state: Apps Script Production 443, Vercel Production không đổi, ba flag false, audience `preview`.

## D5G result

- window: 18:52:08–19:03:03 ICT ngày 11/11/2026; lần audit cuối lúc 19:02:02;
- scope: chỉ workbook Vận tải 2026, audience `production`, expiry 30 phút; đóng chủ động sau gần 10 phút;
- workload: không tạo dữ liệu giả và không có edit nghiệp vụ tự nhiên trong cửa sổ;
- result: `activeJobs=[]`, `generations=[]`, `productionInvalidations=[]`; không claim backlog cũ, không có lỗi hoặc stop condition;
- final state: Apps Script Production/Preview 443, Vercel Production không đổi, ba flag false, allowlist/expiry rỗng, audience `preview`, đúng một reconciler;
- interpretation: PASS safety window không tải; không dùng riêng kết quả này để tuyên bố đạt SLO hoặc bật foreground thường trực.

## D5H result

- window: 19:50:36–19:53:30 ICT ngày 11/11/2026;
- workload: một dòng giả nhập trực tiếp qua giao diện Google Sheets tại `NL_VanChuyen` row 1445 bằng ba thao tác edit, token `D5H-CANARY-20261111-1951`;
- exact row generation: source commit 19:51:03.809, atomic publish 19:51:57.493, latency **53,684 giây**, attempts 1;
- latest aggregate generation: source commit 19:51:13.845, atomic publish 19:52:00.419, latency **46,574 giây**, attempts 1;
- result: hai publication hợp lệ nối tiếp và hai Production invalidation cho `11/2026`; không lỗi, không active job sau hội tụ. Ba thao tác UI tạo hai generation, không phải duplicate delivery của cùng event;
- cleanup: đóng flags trước, clear đúng `NL_VanChuyen!A1445,C1445:F1445,H1445`, giữ công thức/format/metadata; đọc ngược `A1445:I1445` không còn CellData; Dashboard và report `11/2026` resync thành công lúc 19:54:30–19:54:41; helper tạm đã gỡ;
- final state: Apps Script Production/Preview 443, Vercel Production không đổi, ba flag false, allowlist/expiry rỗng, audience `preview`, đúng một reconciler;
- interpretation: PASS đường trigger UI end-to-end dưới 120 giây. Đây là tải tổng hợp có kiểm soát, không thay thế mẫu nhập nghiệp vụ tự nhiên hoặc quan sát dài hạn. Gate còn lại là D5I bật thường trực có giám sát và rollback tức thời.

## Rollback

Chạy `rollbackSyncGenerationForeground` trước mọi rollback deployment. Hàm tắt
ingress generation, dispatcher và publication; xóa allowlist/expiry và đưa
audience về `preview`. Migrations 025–026 và event history được giữ. Background
publisher tiếp tục chạy. Chỉ rollback Apps Script/Vercel theo identity đã ghi
nhận sau khi flags đã tắt.

## Stop conditions

Dừng rollout nếu canary vượt SLO, RPC/pair/invalidation không khớp, duplicate
event không ACK cùng publication, source version đổi trong build, hoặc alias /
deployment identity lệch. Không lặp canary để thử may.
