import Link from 'next/link';
import type { PlatformContext } from '../../lib/platform/types';
import { ShellNavigation, type NavigationItem } from './ShellNavigation';

const ALL_ROLES = ['admin', 'operator', 'shareholder'] as const;
const WRITE_ROLES = ['admin', 'operator'] as const;
const NAVIGATION: NavigationItem[] = [
  { href: '/', label: 'Nền tảng', roles: [...ALL_ROLES] },
  { href: '/dashboard', label: 'Tổng quan', roles: [...ALL_ROLES] },
  { href: '/reports', label: 'Báo cáo', roles: [...ALL_ROLES] },
  { href: '/manage', label: 'Vận hành', roles: [...ALL_ROLES] },
  { href: '/entry', label: 'Nhập liệu', roles: [...WRITE_ROLES] },
  { href: '/catalog', label: 'Danh mục', roles: [...WRITE_ROLES] },
  { href: '/cashflow', label: 'Thu chi', roles: [...ALL_ROLES] },
  { href: '/observability', label: 'Đồng bộ', roles: [...WRITE_ROLES] },
  { href: '/settings', label: 'Tài khoản', roles: [...ALL_ROLES] }
];

export function AppShell({ context, children }: { context: PlatformContext; children: React.ReactNode }) {
  return <div className="platform-shell">
    <a className="platform-skip-link" href="#platform-content">Bỏ qua điều hướng</a>
    <aside className="platform-sidebar">
      <Link className="platform-brand" href="/" aria-label="Vận tải Đông Bắc - Nền tảng Next.js">
        <span className="platform-brand-mark" aria-hidden="true">ĐB</span>
        <span><strong>Vận tải Đông Bắc</strong><small>Next platform</small></span>
      </Link>
      <ShellNavigation items={NAVIGATION} role={context.user.role} />
      <div className="platform-sidebar-footer">
        <span>{context.user.displayName}</span>
        <small>{context.user.role}</small>
        <a href="/" className="platform-legacy-link">Ứng dụng chính</a>
      </div>
    </aside>
    <section className="platform-workspace">
      <header className="platform-topbar">
        <div><p className="platform-eyebrow">WORKBOOK CONTEXT</p><strong>{context.workbook.module === 'cashflow' ? 'Thu chi' : 'Vận tải'} · {context.workbook.year}</strong></div>
        <span className="platform-correlation" title="Mã đối chiếu request">#{context.correlationId.slice(-10)}</span>
      </header>
      <div id="platform-content" className="platform-content" tabIndex={-1}>{children}</div>
    </section>
  </div>;
}
