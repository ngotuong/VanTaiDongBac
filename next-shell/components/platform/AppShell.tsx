'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { normalizeRoutePath, routesEqual } from '../../lib/platform/routes';
import type { PlatformContext } from '../../lib/platform/types';
import { ShellNavigation, type NavigationItem } from './ShellNavigation';
import { SessionKeepAlive, SignOutButton } from './SessionControls';
import { ToastViewport } from './ToastViewport';

const ALL_ROLES = ['admin', 'operator', 'shareholder'] as const;
const WRITE_ROLES = ['admin', 'operator'] as const;
const NAVIGATION: NavigationItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'home', roles: [...ALL_ROLES], bottomRoles: [...ALL_ROLES] },
  { href: '/reports', label: 'Báo cáo', icon: 'reports', roles: [...ALL_ROLES], bottomRoles: [...ALL_ROLES] },
  { href: '/manage', label: 'Vận hành', icon: 'manage', aliases: ['/entry'], roles: [...ALL_ROLES], bottomRoles: [...ALL_ROLES] },
  { href: '/catalog', label: 'Danh mục', icon: 'catalog', roles: [...WRITE_ROLES], bottomRoles: [...WRITE_ROLES] },
  { href: '/cashflow', label: 'Quỹ', icon: 'cashflow', roles: [...ALL_ROLES], bottomRoles: [...ALL_ROLES] },
  { href: '/settings', label: 'Cài đặt', icon: 'settings', aliases: ['/observability'], roles: [...ALL_ROLES], bottomRoles: ['shareholder'] }
];

const PAGE_META: Record<string, [string, string]> = {
  '/': ['TỔNG QUAN', 'Kết quả kinh doanh'], '/dashboard': ['TỔNG QUAN', 'Kết quả kinh doanh'],
  '/reports': ['BÁO CÁO', 'Tổng hợp chi tiết'], '/manage': ['VẬN HÀNH', 'Quản lý vận hành'],
  '/entry': ['VẬN HÀNH', 'Nhập liệu nghiệp vụ'], '/catalog': ['DANH MỤC', 'Quản lý danh mục hệ thống'],
  '/cashflow': ['QUỸ', 'Quản lý quỹ'], '/settings': ['CÀI ĐẶT', 'Cấu hình App'], '/observability': ['CÀI ĐẶT', 'Trạng thái đồng bộ']
};

type DashboardMeta = { updatedAt?: string; source?: 'supabase' | 'apps-script' };

export function AppShell({ context, children }: { context: PlatformContext; children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta>({});
  const [pendingHref, setPendingHref] = useState('');
  const [isNavigationPending, startNavigation] = useTransition();
  const currentPath = normalizeRoutePath(pathname);
  const pageMeta = PAGE_META[currentPath] || ['VẬN TẢI ĐÔNG BẮC', 'Hệ thống điều hành'];
  const isDashboard = currentPath === '/dashboard';
  const navigationTarget = pendingHref && !routesEqual(pendingHref, currentPath) ? pendingHref : '';

  useEffect(() => {
    document.body.classList.toggle('shell-drawer-open', drawerOpen);
    return () => document.body.classList.remove('shell-drawer-open');
  }, [drawerOpen]);

  useEffect(() => {
    const update = (event: Event) => setDashboardMeta((event as CustomEvent<DashboardMeta>).detail || {});
    window.addEventListener('vtdb:dashboard-meta', update);
    return () => window.removeEventListener('vtdb:dashboard-meta', update);
  }, []);

  useEffect(() => {
    if (!navigationTarget) return;
    const timeout = window.setTimeout(() => setPendingHref(''), 12000);
    return () => window.clearTimeout(timeout);
  }, [navigationTarget]);

  const navigate = (href: string) => {
    if (routesEqual(href, currentPath) || (Boolean(navigationTarget) && routesEqual(navigationTarget, href))) { setDrawerOpen(false); return; }
    setDrawerOpen(false);
    setPendingHref(href);
    startNavigation(() => router.push(href));
  };

  const refresh = () => document.querySelector<HTMLButtonElement>('[data-shell-refresh]')?.click();
  const subtitle = isDashboard ? `Cập nhật: ${dashboardMeta.updatedAt || 'Vui lòng chờ...'}` : `Cập nhật: ${dashboardMeta.updatedAt || 'Vui lòng chờ...'}`;

  return <div className="app">
    <SessionKeepAlive />
    <a className="platform-skip-link" href="#platform-content">Bỏ qua điều hướng</a>
    <div className="drawer-backdrop shell-drawer-backdrop" aria-hidden={!drawerOpen} onClick={() => setDrawerOpen(false)}/>
    <aside className="sidebar" aria-label="Menu ứng dụng">
      <button type="button" className="drawer-close" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}>×</button>
      <div>
        <button type="button" className="brand" aria-label="Vận tải Đông Bắc - Tổng quan" onClick={() => navigate('/dashboard')}>
          <Image className="brand-mark" src="/static/assets/apple-touch-icon.png" alt="Logo" width={44} height={44} priority/>
          <span><span className="brand-name">Vận tải Đông Bắc</span><span className="brand-sub">Hệ thống nội bộ</span></span>
        </button>
        <ShellNavigation items={NAVIGATION} role={context.user.role} pendingHref={navigationTarget} onNavigate={navigate}/>
        <div className="auth-user"><div className="auth-user-email">{context.user.displayName}</div><SignOutButton /></div>
      </div>
    </aside>
    <main className="main" id="platform-content">
      <header className="topbar">
        <button type="button" className="menu-button" aria-label="Mở menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><svg className="btn-svg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
        <div><div className="eyebrow">{pageMeta[0]}</div><h1>{pageMeta[1]}</h1><div className="subtitle">{subtitle}{dashboardMeta.source ? <span className={`source-badge ${dashboardMeta.source === 'supabase' ? 'source-supabase' : 'source-appscript'}`} title={dashboardMeta.source === 'supabase' ? 'Đang đọc từ Supabase cache' : 'Đang đọc fallback từ Apps Script'}>{dashboardMeta.source === 'supabase' ? 'S' : 'AS'}</span> : null}</div></div>
        <div className="top-actions">
          <button type="button" className="ghost icon-button" aria-label="Cập nhật dữ liệu" title="Cập nhật" onClick={refresh}><svg className="btn-svg" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg></button>
          <a href="/open-sheet" target="_blank" rel="noreferrer" title="Google Sheet" className="ghost icon-button" aria-label="Mở Google Sheet"><svg className="btn-svg" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg></a>
        </div>
      </header>
      <div className={`route-progress${navigationTarget || isNavigationPending ? ' active' : ''}`} aria-hidden="true"><span/></div>
      <span className="platform-visually-hidden" role="status" aria-live="polite">{navigationTarget ? `Đang chuyển tới ${PAGE_META[navigationTarget]?.[1] || 'màn hình mới'}.` : ''}</span>
      {children}
    </main>
    <ShellNavigation items={NAVIGATION} role={context.user.role} mode="bottom" pendingHref={navigationTarget} onNavigate={navigate}/>
    <ToastViewport/>
  </div>;
}
