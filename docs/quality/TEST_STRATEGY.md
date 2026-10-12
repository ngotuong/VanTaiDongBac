# TEST_STRATEGY

Quality owner; current checkpoint/results thuộc context và runbook. Cập nhật 2026-10-03.

## Gate và môi trường

```bash
npm test
npm run test:sql
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
git diff --check
```

Build bao gồm Identity Guard. CI quality chạy cùng gates; không dùng credentials live. SQL test cần Docker, PostgreSQL disposable network-none và cleanup finally. Unit dùng fake adapters/fixtures; không gọi Google/Supabase thực. Test có writes/canary chỉ trên exact bản sao được duyệt. **Không chạy production-rbac-smoke mặc định** vì tạo user/data.

- Local/static: syntax, source contract, mapping, pure calculations, service/error handling.
- Isolated DB: migration thực thi, grants/RLS/RPC, transaction/concurrency, không chỉ regex SQL.
- Copy-canary: Apps Script/Sheets thực trên bản sao riêng; formula recalc, lock, crash/retry, rollback exact rows.
- Authenticated browser: role/navigation/form/jobs/data freshness, desktop/mobile/light/dark/keyboard, iPhone/Safari khi có.
- Production smoke: read-only HTTP/health/identity; writes chỉ khi có phê duyệt riêng trong cửa sổ triển khai.

## Ma trận nghiệp vụ bắt buộc

| Luồng | Hành vi phải xác minh |
|---|---|
| API/Auth/RBAC | method/origin/allowlist, inactive/outside user, shareholder read-only, operator/admin boundaries, cookie refresh, secrets không đi browser |
| Workbook | server year/id resolution, reject mismatch, không activeSpreadsheet fallback, hai domain độc lập |
| Sheet writes | exact mapping; giữ formulas/helpers/format; text '=' literal; no physical delete có helper; chèn/move/edit trước worker reject |
| Queue | canonical same intent/race 409, atomic claims disjoint, attempts/leases/log ownership, persistence failure không bỏ batch; uncertain writes chặn replay |
| Fund | debt/offset loại cash đúng, settings/opening/current/period balance, full identity; journal crash/partial/complete; không duplicate append |
| Loan | principal/interest/nonFund, historical outstanding/current settlement, exact orphan reconciliation dùng cả read/write, overpayment reject |
| Payroll | source authoritative BC; XL intermediate; lịch sử đợt/rule/month-days/rounding/Agg; mixed daily/rates/KPI/leave/BHXH/Thực nhận cuối; mismatch needs_review, formula failure không publish |
| Report/cache | golden matrix exact month + Tất cả, source_data_version/hash, volatile fields loại khỏi hash, cache miss/fallback/version/invalidation |
| Sync/trigger | edit/change/manual/queued write, tháng ảnh hưởng, delayed IMPORTRANGE verification, ưu tiên foreground dưới backlog/shared tick budget, quota/ownership/watchdog |
| Notifications | endpoint SSRF policy, subscription owner, preferences/RBAC, expired devices, partial delivery retry, unread badge, no fake zero financial summary |
| UI | pending nhận lệnh khác saved, terminal reload, errors/retry, unsaved close, focus restore/trap/hidden controls, labels, overflow/touch targets/dark contrast |
| Deploy/rollback | immutable paired candidate, manifest cả dirty source, Preview production-alias guard, trigger HEAD effects, rollback schema/cache/journal compatibility |

## Fixtures và assertions

- Dữ liệu tổng hợp nhỏ, rõ expected values; raw Sheets numbers khác formatted display strings.
- Fixture mới phải mô tả contract thật; không thêm fallback vào production code chỉ để giữ test cũ.
- Regression phải tái hiện trigger/nguyên nhân/tác động. Fault injection ở persistence boundary: trước write, ghi một phần, sau write/trước complete, sau complete/trước queue result.
- Không sao chép thuật toán production sang test rồi dùng làm oracle. Formula/contract/independent expected totals là oracle; source regex chỉ kiểm tra cấu trúc, không chứng minh behavior/RLS/a11y.
- Không đưa PII/secret/raw credentials vào fixtures, artifact hoặc logs.

## Trước release

1. Targeted tests rồi full gate; chỉ chạy lại khi có change/failure/concern mới.
2. Migration/permissions trên isolated DB; copy-canary/formula/parity khi write/sync/payroll đổi.
3. Browser QA representative roles/devices/themes và keyboard; không dùng unit thay visual/device QA.
4. Baseline backup, reviewed source manifest, exact versions/IDs; rollback được xác minh READY và tương thích cache/journal.
5. Báo pass/fail/skipped riêng, commands, môi trường, phạm vi chưa kiểm chứng. Không claim Production corrected từ local PASS.

Chi tiết R8 acceptance/fault/live approval/rollback: [runbook](../operations/R8_REMEDIATION.md). Domain invariants do `docs/contracts/` sở hữu, không lặp checklist/checkpoint history tại đây.
