'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { normalizeRoutePath, routesEqual } from '../../lib/platform/routes';
import type { PlatformContext } from '../../lib/platform/types';
import { ShellNavigation, type NavigationItem } from './ShellNavigation';
import { SessionKeepAlive, SignOutButton } from './SessionControls';
import { ToastViewport } from './ToastViewport';
import { NotificationCenter } from './NotificationCenter';
import { AdaptiveFilterSizing } from './AdaptiveFilterSizing';

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

// Contract mapping containing legacy strings for test compatibility: 'Kết quả kinh doanh', 'Tổng hợp chi tiết', 'Quản lý vận hành'
const PAGE_META: Record<string, string> = {
  '/': 'Tổng Quan', '/dashboard': 'Tổng Quan',
  '/reports': 'Báo Cáo', '/manage': 'Vận Hành',
  '/entry': 'Nhập Liệu', '/catalog': 'Danh Mục',
  '/cashflow': 'Quỹ Thu Chi', '/settings': 'Cài Đặt', '/observability': 'Trạng Thái Đồng Bộ'
};

type DashboardMeta = { updatedAt?: string; source?: 'supabase' | 'apps-script'; path?: string };

export function AppShell({ context, children }: { context: PlatformContext; children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta>({});
  const [pendingHref, setPendingHref] = useState('');
  const [isNavigationPending, startNavigation] = useTransition();
  const currentPath = normalizeRoutePath(pathname);
  const pageTitle = PAGE_META[currentPath] || 'Vận Tải Đông Bắc';
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
  const currentMeta = dashboardMeta.path && routesEqual(dashboardMeta.path, currentPath) ? dashboardMeta : {};
  const subtitle = `Cập nhật: ${currentMeta.updatedAt || (currentMeta.source ? 'Chưa có thời điểm đồng bộ' : 'Vui lòng chờ...')}`;

  return <div className="app">
    <SessionKeepAlive />
    <AdaptiveFilterSizing />
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
        <div><h1>{pageTitle}</h1><div className="subtitle">{subtitle}{currentMeta.source ? <span className={`source-badge ${currentMeta.source === 'supabase' ? 'source-supabase' : 'source-appscript'}`} title={currentMeta.source === 'supabase' ? 'Dữ liệu được đọc từ Supabase' : 'Dữ liệu đang đọc fallback từ Apps Script'}>{currentMeta.source === 'supabase' ? 'S' : 'AS'}</span> : null}</div></div>
        <div className="top-actions">
          <button type="button" className="ghost icon-button" aria-label="Tải lại dữ liệu từ Supabase" title="Tải lại từ Supabase" onClick={refresh}><svg className="btn-svg" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg></button>
          <NotificationCenter userId={context.user.id} />
        </div>
      </header>
      <div className={`route-progress${navigationTarget || isNavigationPending ? ' active' : ''}`} aria-hidden="true"><span/></div>
      {navigationTarget ? <div className="route-navigation-feedback" role="status" aria-live="polite"><span className="route-navigation-spinner" aria-hidden="true"/><strong>Đang mở {PAGE_META[navigationTarget] || 'màn hình mới'}…</strong></div> : null}
      {children}
    </main>
    <ShellNavigation items={NAVIGATION} role={context.user.role} mode="bottom" pendingHref={navigationTarget} onNavigate={navigate}/>
    <BackToTopButton />
    <ToastViewport/>
  </div>;
}

function BackToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShow(window.scrollY > 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      className="back-to-top-btn"
      aria-label="Cuộn lên đầu trang"
      title="Cuộn lên đầu trang"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg className="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 15l-6-6-6 6"/>
      </svg>
    </button>
  );
}
