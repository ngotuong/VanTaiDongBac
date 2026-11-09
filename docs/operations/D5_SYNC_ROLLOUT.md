# D5 Sync rollout

## Boundary

D5 mở foreground publication cho đúng workbook Vận tải hiện hành trong cửa sổ
30 phút. Background publisher vẫn là fallback. Không đổi workbook Thu chi, tên
sheet, thứ tự cột hoặc công thức.

## Preconditions

- migrations 001–025 PASS và migration 025 đã apply vào project canonical;
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
5. Cleanup đúng ô test và row metadata của canary; không xóa dòng hoặc công thức.

## Rollback

Chạy `rollbackSyncGenerationForeground` trước mọi rollback deployment. Hàm tắt
ingress generation, dispatcher và publication; xóa allowlist/expiry và đưa
audience về `preview`. Migration 025 và event history được giữ. Background
publisher tiếp tục chạy. Chỉ rollback Apps Script/Vercel theo identity đã ghi
nhận sau khi flags đã tắt.

## Stop conditions

Dừng rollout nếu canary vượt SLO, RPC/pair/invalidation không khớp, duplicate
event không ACK cùng publication, source version đổi trong build, hoặc alias /
deployment identity lệch. Không lặp canary để thử may.
