# WORKFLOW

## 1. Khởi động

1. Đọc `AGENTS.md` và toàn bộ `PROJECT_CONTEXT.md`.
2. Chạy `git status --short`.
3. Chỉ đọc tài liệu chuyên biệt theo `docs/ai/AI_START_HERE.md`.
4. Xác nhận checkpoint được phê duyệt và giải thích kế hoạch ngắn bằng tiếng Việt.

Không tự sửa/deploy/migration/commit/push khi người dùng mới chỉ yêu cầu đọc hoặc báo trạng thái.

## 2. Phát triển local

- Frontend/source Next.js: `next-shell/`, entrypoint mỏng `app/`, API Vercel trong `api/`.
- Apps Script standalone backend: các file `*.gs` ở root.
- Supabase server boundary: `server/` và migrations.
- Không dùng `SpreadsheetApp.getActiveSpreadsheet()` làm workbook chính; dùng `openById(id)`.
- Không đổi tên sheet, thứ tự cột hoặc công thức. Thay đổi cấu trúc dùng migration riêng.
- Giữ nguyên thay đổi người dùng đang có; không reset worktree để giải quyết xung đột.

## 3. Quality gates

Gate local mặc định:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

`npm run build` bao gồm Environment Identity Guard. Với thay đổi scoped nhỏ có thể chạy targeted test trước, nhưng trước deploy/commit checkpoint phải chạy gate đầy đủ phù hợp.

Test có ghi Google Sheet/Supabase production chỉ chạy sau phê duyệt rõ và phải biết exact target/cleanup.

## 4. Deploy Preview

URL Preview ổn định duy nhất:

```text
https://vantaidongbac-preview.vercel.app
```

Lệnh duy nhất:

```bash
npm run deploy:preview
```

Script phải:

- khóa project ID `prj_ksh9aZZowziqFw2G2tWJzbnwtSOG`;
- dùng Production environment secrets với `--prod --skip-domain`;
- chỉ gán alias Preview;
- chạy test/lint/typecheck/build/diff/identity gate;
- xác nhận root HTTP 200, title `Vận tải Đông Bắc`, không Vercel Login;
- xác nhận deployment ID của `dongbac.vercel.app` không đổi.

Không chạy trực tiếp `vercel deploy`, `vercel alias set`, `vercel promote`; không dùng alias `vantaidongbac-c3-preview.vercel.app`.

Vercel Git Integration đã disconnect và `gitProviderOptions.createDeployments=disabled`. Push/merge GitHub không tự tạo deployment; mọi Preview phải đi qua script trên để dùng đúng environment và guard.

## 5. Apps Script Preview

Khi backend thay đổi và checkpoint cho phép:

1. chạy gate local;
2. xác minh ảnh hưởng shared HEAD tới Production triggers và duyệt cửa sổ triển khai ghép cặp trước `clasp push`;
3. tạo version bất biến có mô tả;
4. update đúng deployment ID Preview đã khóa;
5. kiểm tra direct health và health qua Vercel;
6. xác nhận fingerprint app/Supabase/Vercel/Apps Script;
7. chạy canary có kiểm soát nếu write/sync path thay đổi;
8. cleanup exact test jobs/data.

Không update production deployment trong checkpoint Preview. Preview cùng project không cô lập trigger HEAD; không push backend để thử Preview khi chưa duyệt ảnh hưởng worker Production.

## 6. Production

Production chỉ được thay đổi trong yêu cầu/phê duyệt riêng.

Trước cut-forward:

- candidate Preview/authenticated QA đã được duyệt;
- gate local và remote PASS;
- ghi lại Vercel/Apps Script deployment hiện tại làm rollback;
- kiểm tra đúng bộ environment Production;
- nếu có migration destructive: backup, fingerprint, dry-run và one-shot approval.

Khi cutover đã được phê duyệt riêng, dùng `npm run deploy:production -- --phase=prepare|activate|rollback --expected-production=dpl_... --record=artifacts/...json`. Prepare cần `--writes-paused=true|false`, chạy full local/isolated SQL/runtime audit gates, đóng gói đúng endpoint Production và không đổi alias. Activate/rollback kiểm tra baseline/project/READY/health; mở ghi yêu cầu paired backend, exact payroll parity, browser roles và queue reconciliation trong record có bằng chứng. Candidate bảo trì không thay việc chốt gate; không kích hoạt để chờ người dùng đăng nhập kéo dài. ID/state do context sở hữu.

Sau cut-forward:

- smoke root, route chính, manifest/service worker, session 401 và health;
- authenticated smoke cho module bị ảnh hưởng;
- kiểm tra không 5xx và identity đúng;
- xác nhận rollback deployment còn READY;
- cập nhật `PROJECT_CONTEXT.md`.

## 7. Supabase migration

- Migration live hiện hành do [PROJECT_CONTEXT](PROJECT_CONTEXT.md) sở hữu.
- Không sửa migration đã apply; correction phải dùng số phiên bản tiếp theo.
- Ưu tiên additive migration và rollback runtime/feature flag.
- RLS/server-only grants và service-role boundary phải có test.
- Không đưa secret/token vào source, log hoặc tài liệu.

## 8. Git và handoff

- `main` là nhánh canonical; branch checkpoint đã merge phải được xóa thay vì tích lũy lâu dài.
- Chỉ dùng archive tag cho đầu nhánh divergent/backup thật sự cần bảo tồn; không tạo lại branch nếu chưa cần khôi phục commit cụ thể.
- Một checkpoint nên có commit có chủ đích; không trộn dependency artifact hoặc dữ liệu tạm.
- `node_modules/`, `.next/`, local env và `.vercel/` không thuộc source.
- Trước commit: `git status --short`, `git diff --check`, full gate và rà secret.
- Sau thay đổi: báo file, mục đích, cách test, phần chưa kiểm tra và rollback.
- Cập nhật `PROJECT_CONTEXT.md` khi checkpoint/production/architecture/source-of-truth/risk thay đổi.

## 9. Trạng thái tài liệu

- Loại: `CURRENT` operations workflow.
- Ngày hệ thống lại: 2026-08-10.
- Owner current deployment/checkpoint: `PROJECT_CONTEXT.md`.
- Rollback chi tiết: `ROLLBACK.md`.
