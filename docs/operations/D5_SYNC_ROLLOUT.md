# D5 Sync rollout

> D5 ngày 09/11 và D5D ngày 10/11 đều đã fail và rollback. D5D dừng đúng
> stop condition với `report_month_not_active`, không có bundle/invalidation.
> Không tái sử dụng runbook này cho một Production canary mới cho đến khi D5E
> chẩn đoán/fix month selection, có regression + copy-canary và
> `PROJECT_CONTEXT.md` cho phép cửa sổ mới.

## Boundary

D5 mở foreground publication cho đúng workbook Vận tải hiện hành trong cửa sổ
30 phút. Background publisher vẫn là fallback. Không đổi workbook Thu chi, tên
sheet, thứ tự cột hoặc công thức.

## Preconditions

- migrations 001–026 PASS và migration 026 đã apply vào project canonical;
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
