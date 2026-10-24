# KNOWN_RISKS

Risk register hiện hành, không phải lịch sử incident. Cập nhật 2026-10-24. Trạng thái release và phạm vi đã xác minh thuộc context; không suy ra mitigation Production chỉ từ thay đổi local. [R8 runbook](../operations/R8_REMEDIATION.md) sở hữu nghiệm thu R8; [báo cáo audit](AUDIT_REPORT.md) sở hữu bằng chứng/phương án các phát hiện local mới.

## Mức và bằng chứng

Critical: hệ thống/secret/tài chính có tác động nghiêm trọng tức thời. High: sai dữ liệu/quyền, mất/trùng giao dịch hoặc cản vận hành đáng kể. Medium: nhất quán/khả dụng/UX/performance có điều kiện. Low: bảo trì/hardening ít tác động.

**Đã xác minh** phải có trigger/source hoặc runtime evidence. **Rủi ro** có cơ chế nhưng chưa xảy ra/tái hiện. **Chưa đủ bằng chứng** không được kết luận thành lỗi. Snapshot có thời điểm, source local và deployment live không đồng nhất mặc định.

## Register

| Phạm vi | Rủi ro/tác động | Gate/giảm thiểu |
|---|---|---|
| Financial formulas | Ghi đè K/M/N/helpers; spill collision làm báo cáo lỗi | Preserve business columns; exact migration, kiểm tra bound writers, không repair trong write |
| Row identity | Row index đổi giữa mở form và worker → nhầm giao dịch | Full fingerprint debt/offset/voucher/date/amount/content, reject drift |
| Replay/uncertain write | Sheet thành công, queue/persistence lỗi → append trùng | Durable intent journal; exact rows/hash; partial/legacy cần đối soát, không bulk retry |
| Transport journal — candidate local | Developer Metadata row marker giảm ghi trùng/ghi đè khi retry; metadata quota, tải lớn và dữ liệu/job legacy Production chưa được canary | U01/U04 có unit/fault tests: exact/blank/drift/legacy và Catalog job identity. Review đã sửa API location từ `getRange()` sang `getRow()`; canary Apps Script/Sheet thật tiếp tục phát hiện numeric full-width range không phải row dimension, nên marker dùng A1 `N:N`. Lần chạy lại 24/10 PASS exact replay, row shift và các nhánh reconciliation; Production vẫn dùng cơ chế cũ |
| Fund range coverage — candidate local | Thiếu cache phải fail closed trừ leading pre-data có metadata đồng nhất; bundle cắt giữ `limited/incomplete`, nhưng giới hạn 1.000 và thiếu pagination vẫn có thể cho subset | U02/U03 regression PASS. Read-only canary 24/10 dùng metadata thật 05–10/2026, 282/282 giao dịch và fault cases coverage/limited PASS. Chưa đối soát số tiền live; dữ liệu hiện tại chưa chạm limit 1.000; pagination nguồn vẫn mở |
| Audit candidate chưa deploy | Guard năm/retry race/cookie/metadata/client request ID, journal và Fund coverage đã sửa local; Production vẫn có hành vi cũ | A01–A07/U01–U04 trong báo cáo, full933/SQL/lint/typecheck/build PASS. Registry populated đã loại env-only year. Canary journal/Fund và authenticated Production baseline PASS; commit/push/Preview + authenticated candidate QA cần duyệt riêng; client dedupe chỉ trong đời component |
| Queue | Stale/exhausted lease treo, claim race, log error bỏ batch | Atomic service-role RPC/min lease; reaper/log; persistence isolation; SQL concurrent tests |
| Payroll/report | Sai tháng/nguồn/rule/rounding/Thực nhận, thiếu daily split hoặc formula error biến 0 | Authoritative parity/version/hash; needs_review/fail-closed; monthly/daily golden fixture |
| Cache/sync | Manual edit/IMPORTRANGE trễ, marker/version cache stale | Direct triggers + polling/fingerprint/delayed verification; eventual consistency phải hiển thị |
| Optimistic UI | Pending coi là saved, failed giữ số tạm, terminal resurrect row | Track mọi mutation, invalidate/refetch, error/actionable retry; browser regression |
| Loans | Orphan reconciliation read/write khác nhau → trả quá dư | Cùng reconcile logic; ambiguous không tự gộp; principal/interest/nonFund test |
| Bound/direct edits | Bypass RBAC/mapping, xóa marker hoặc tái tạo collision | Phân biệt execution context, xác minh live source/permissions, maintenance coordination |
| Security | Server secret leak, Apps Script proxy bypass, role/allowlist drift | Server-only secrets/grants; origin/token/role tests; representative role QA |
| Push | SSRF endpoint; partial failure resend healthy devices | Provider allowlist tại mọi send; deadline; per-device/event ledger |
| Push delivery | Provider nhận rồi ledger lỗi/concurrent dispatch → gửi trùng | At-least-once residual; chưa exactly-once; theo dõi logs, không claim guaranteed delivery |
| Notification pipeline | Endpoint thiếu workbook context hoặc bundle nguồn stale → cron500 và cảnh báo hệ thống lặp | Constructor contract regression, explicit-year regression, paired Apps Script/Vercel release; live23/10 dispatch200 và ba sync key `ok`. Giữ theo dõi 5xx/status; refresh source tuần tự khi cache cũ |
| Performance | Full scans, lock contention, quota, upstream timeout | Mapping410 đã paired deploy/sharedHEAD65exact,helper removed/guards restored/watchdogACTIVE/fullscope+verification/source/cache/payroll/jobs PASS. Native recentpublication2.081s/append78ms,publish1.580s;month10publication1.654s. 409recent29.105s/append24.708s làexecutionkhác,khôngcausalratio. NativeABBA12payloadSHAexact/855tests PASS;synthetic khôngchứng minhrootcause408publication144.973s hoặchumanSLA. 410timer09:01completed94.098s;nativecallkhông bịngắt bởi between-stagebudget. Naturalhuman-edit1–2phút chưaverified. UNKNOWN409lịchsửgiữriêng,khônggánverifiedsuccess/failure. Giữ drift/stamp/hash/restart vàfixedmetadata instrumentation |
| Multi-year | Cache/queue/trigger/công thức lẫn năm; tạo file trùng; ID Sheet lộ client; manifest xóa nhầm dữ liệu | Registry020 server-only, lifecycle một active year, env fallback, admin wizard, Drive copy lock/dedup, exact-range manifest giữ formula, audit/token/transactional activation/rollback đã live Production trên Apps Script425/frontend `dpl_GBoatQF8rDwzLNtddtRr79wULwSL`. Canary v3 và workbook2027 audit0 blocker/0 warning PASS;2026 active,2027 ready/chỉ đọc. Activation vẫn là cửa sổ riêng theo [YEAR_ROLLOVER](../operations/YEAR_ROLLOVER.md) |
| Deploy | Dirty source khác Git HEAD; shared Apps Script HEAD đổi trigger Prod | Snapshot/manifest/paired release; riêng approval cho HEAD/migration/Production |
| Rollback | Code cũ không hiểu journal/cache v6; restore workbook ghi đè dữ liệu mới | Drain/reconcile exact jobs, paired baseline HEAD/version, forward schema correction |
| Backup | Metadata cloud không chứng minh đúng bytes hoặc phục hồi được | Owner đã so bytes đúng archive04/10;scope này không chứng minh archive407 khác/restore drill. Backup mới từng cửa sổ và đối chiếu manifest |
| Dependency | Runtime vulnerabilities; dev lint chain advisory chưa cập nhật trong checkpoint | `npm audit --omit=dev` = 0. Full audit 24/10 còn 1 High ở dev chain `eslint-config-next@16.3.8 → eslint-plugin-react-hooks → zod@4.4.3`; [zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) có fix `>=4.6.6`. Không tự đổi lockfile ngoài checkpoint; đánh giá update toolchain riêng |
| CI/QA | Regex/source tests không chứng minh DB/RLS/visual/device | Privatebranch/draftPR#2 remoteQualityCI PASS đúngsourcecommit4d87d5e/472manifest;855tests/actualSQL001–018/lint/typecheck/build/audit/diff. Freshowner410+approvedcriticalboundaryroles04/10;physicaliPhone/naturalhuman-editSLA còn mở,khôngclaim từemulation |
| Accessibility/theme | Focus escape/title/hidden controls, touch/overflow/contrast | Shared trap/semantic controls, keyboard/mobile/desktop/light/dark QA |
| OAuth/watchdog | Thu hồi quyền/Google chặn; GitHub scheduler không SLA | Health/owner/identity/Executions; phân biệt deployment access với OAuth |
| Disposable QA | Bản sao/dữ liệu giả/quyền thử nghiệm bị bỏ quên | Guard cấm nguồn Production,no installed triggers/versioned deploy;cleanup benchmark10/10 verified:exact cell restored,copy+projectTrash,both OAuth scopes revoked. Hai project giả lập11/10 Trash/APIverified,cache38ownedkeysfinallyremoved,0newOAuth/installedtriggers/versioneddeploy/financialwrites. ProjectmappingABBA11/10Trash/APIverified22:52,syntheticarraysonly/noSheet-cache/noOAuth-trigger-versioneddeploy-Supabase-financialwrite. Canary journal24/10 tạo 2 spreadsheet dữ liệu giả; cả hai được Trash qua `finally`, projectTrash, localtempremoved, không chạm workbook nghiệp vụ. Giữ ledger;không restore/regrant từ approval cũ |
| Legacy service worker | Client cũ giữ route/data behavior | Current SW không cache app/data; kiểm tra installed client khác fresh browser |
| Documentation | Timeline/snapshot stale lẫn current state | Một context ngắn, router/domain owner, Git history/baseline cho rationale |

## Trước thay đổi hoặc incident

- Xác minh target và nguồn evidence; đánh giá data loss/duplicate, permissions, source-of-truth, rollback và trigger HEAD.
- Không tự chữa audit bằng write/migration/deploy ngoài checkpoint được duyệt.
- Lưu snapshot/source/hash/exact scope trước destructive action; không restore toàn workbook để chữa vài cells.
- Cập nhật owner contract/tests và trạng thái gate thật; không xóa rủi ro vì mới sửa local.
- Chỉ mở ghi sau health/Sheet/bundle/queue/role/rollback verification trong cửa sổ được duyệt.
