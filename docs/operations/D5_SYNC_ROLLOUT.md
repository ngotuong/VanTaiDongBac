# D5 Sync rollout

> D5 ngày 09/11 và D5D ngày 10/11 đều đã fail và rollback. D5E sửa exact-month.
> D5F ngày 11/11 đã terminalize exact generation D5D bằng migration 027, đưa
> Apps Script Production 434→443 và chạy đúng một canary PASS trong 66,832 giây.
> Dữ liệu thử/helper đã dọn sạch và ba flag đã tắt lại. Không mở cửa sổ tiếp
> theo cho đến khi D5G được phê duyệt riêng.

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
