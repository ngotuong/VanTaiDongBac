import { cookies } from 'next/headers';
import { createAppUserRepository } from '../../../server/repositories/app-user-repository.js';
import { runtimeConfig } from '../../../server/runtime-config.js';
import { createAuthService } from '../../../server/services/auth-service.js';
import { createWorkbookContextService } from '../../../server/services/workbook-context-service.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Foundation' };

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export default async function FoundationPage({ searchParams }) {
  const query = await searchParams;
  const store = await cookies();
  const request = { headers: { cookie: store.toString() } };
  const config = runtimeConfig();
  const repository = createAppUserRepository({ httpError });
  const auth = createAuthService({ appUserRepository: repository, httpError });
  const contexts = createWorkbookContextService({ httpError });
  try {
    const user = await auth.getAuthenticatedUser(request, config);
    const context = contexts.publicContext({ module: query?.module, year: query?.year });
    return <main className="next-accounts-shell" data-foundation-slice="authenticated">
      <section className="info-card">
        <p className="next-report-eyebrow">NEXT FOUNDATION A1</p>
        <h1>Request context</h1>
        <p>Đăng nhập: {user.displayName} · {user.role}</p>
        <p>Workbook: {context.module} · {context.year}</p>
        <p>Vertical slice này chỉ đọc context phía server; Spreadsheet ID không được render xuống browser.</p>
      </section>
    </main>;
  } catch (error) {
    return <main className="next-accounts-shell" data-foundation-slice="unauthorized">
      <section className="info-card next-report-error">
        <h1>Không thể tạo request context</h1>
        <p>{error.message || 'Phiên đăng nhập hoặc workbook context không hợp lệ.'}</p>
        <a href="/">Quay lại ứng dụng chính</a>
      </section>
    </main>;
  }
}
