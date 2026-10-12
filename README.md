# Vận Tải Đông Bắc Web App

Ứng dụng điều hành nội bộ: Next.js/Vercel → Apps Script standalone → Google Sheets theo module/năm. Supabase phục vụ Auth/read model/cache/queue; Sheets vẫn là source of truth. Vận tải và Thu chi là hai module riêng.

## Tiếp tục công việc

Đọc toàn bộ [AGENTS.md](AGENTS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) và kiểm tra `git status --short`. Quy tắc, trạng thái/checkpoint và đường đọc tài liệu lần lượt do hai file này và [router](docs/ai/AI_START_HERE.md) sở hữu. Chỉ đọc owner cần thiết cho tác vụ; không đọc toàn bộ docs/artifacts.

Plans/specs của checkpoint hoàn tất được tra cứu qua Git history. Snapshot/bằng chứng local trong `artifacts/` không phải backlog sống hoặc phê duyệt cho thao tác mới. R8 còn mở theo context và [runbook](docs/operations/R8_REMEDIATION.md).

## Source và contract

- `next-shell/`, `app/`, `public/`: presentation và PWA; frontend legacy không còn build từ source hiện hành.
- `api/`, `server/`: API/Auth/RBAC và server boundary.
- Root `*.gs`: Apps Script API/integration, cấu hình và nghiệp vụ Sheets; module ownership tại [MODULE_MAP](docs/architecture/MODULE_MAP.md).
- [PROJECT_SCHEMA](PROJECT_SCHEMA.md): schema index; cấu hình workbook/API tại [SPREADSHEET_CONTRACTS](docs/contracts/SPREADSHEET_CONTRACTS.md) và [API_CONTRACTS](docs/contracts/API_CONTRACTS.md).
- [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md): kiến trúc đích, không phải quyền tự bắt đầu step kế tiếp.

## Deploy và phục hồi

Preview frontend chỉ qua `npm run deploy:preview`, alias ổn định `vantaidongbac-preview.vercel.app`. Production/backend chỉ trong phạm vi được phê duyệt riêng; không tự chạy sync/deploy từ tài liệu lịch sử.

Thao tác và gate tại [WORKFLOW](WORKFLOW.md); phục hồi tại [ROLLBACK](ROLLBACK.md). ID/version/baseline hiện hành chỉ thuộc context; xác minh live trước thao tác.
