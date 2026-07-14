'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlatformContext } from '../../lib/platform/types';
import { ShellNavigation, type NavigationItem } from './ShellNavigation';
import { SignOutButton } from './SessionControls';

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
  '/dashboard': ['TỔNG QUAN', 'Kết quả kinh doanh'],
  '/reports': ['BÁO CÁO', 'Tổng hợp chi tiết'],
  '/manage': ['VẬN HÀNH', 'Quản lý vận hành'],
  '/entry': ['VẬN HÀNH', 'Nhập liệu nghiệp vụ'],
  '/catalog': ['DANH MỤC', 'Quản lý danh mục hệ thống'],
  '/cashflow': ['QUỸ', 'Quản lý quỹ'],
  '/settings': ['CÀI ĐẶT', 'Cấu hình App'],
  '/observability': ['CÀI ĐẶT', 'Trạng thái đồng bộ']
};

export function AppShell({ context, children }: { context: PlatformContext; children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pageMeta = PAGE_META[pathname] || ['VẬN TẢI ĐÔNG BẮC', 'Hệ thống điều hành'];

  useEffect(() => {
    const saved = window.localStorage.getItem('vtdb-theme');
    const nextTheme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    document.body.classList.toggle('platform-drawer-open', drawerOpen);
    return () => document.body.classList.remove('platform-drawer-open');
  }, [drawerOpen]);

  const refreshCurrentModule = () => {
    const refresh = document.querySelector<HTMLButtonElement>('[data-shell-refresh]');
    refresh?.click();
  };

  return <div className="platform-shell">
    <a className="platform-skip-link" href="#platform-content">Bỏ qua điều hướng</a>
    <button type="button" className="platform-drawer-backdrop" aria-label="Đóng menu" tabIndex={drawerOpen ? 0 : -1} onClick={() => setDrawerOpen(false)} />
    <aside className={`platform-sidebar${drawerOpen ? ' open' : ''}`} aria-label="Menu ứng dụng">
      <button type="button" className="platform-drawer-close" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}>×</button>
      <Link className="platform-brand" href="/dashboard" prefetch={false} aria-label="Vận tải Đông Bắc - Tổng quan" onClick={() => setDrawerOpen(false)}>
        <Image className="platform-brand-mark" src="/static/assets/apple-touch-icon.png" alt="Logo Vận tải Đông Bắc" width={44} height={44} priority />
        <span><strong>Vận tải Đông Bắc</strong><small>Hệ thống nội bộ</small></span>
      </Link>
      <ShellNavigation items={NAVIGATION} role={context.user.role} onNavigate={() => setDrawerOpen(false)} />
      <div className="platform-sidebar-footer">
        <span>{context.user.displayName}</span>
        <small>{context.user.role}</small>
        <SignOutButton />
      </div>
    </aside>
    <main className="platform-workspace">
      <header className="platform-topbar">
        <button type="button" className="platform-menu-button" aria-label="Mở menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="platform-page-heading"><p className="platform-eyebrow">{pageMeta[0]}</p><h1>{pageMeta[1]}</h1><p>{context.workbook.module === 'cashflow' ? 'Thu chi' : 'Vận tải'} · {context.workbook.year}</p></div>
        <div className="platform-top-actions">
          <button type="button" className="platform-refresh-button" aria-label="Cập nhật dữ liệu" title="Cập nhật dữ liệu" onClick={refreshCurrentModule}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
          </button>
          <a className="platform-sheet-button" href={`/open-sheet?module=${context.workbook.module}&year=${context.workbook.year}`} target="_blank" rel="noreferrer" aria-label="Mở Google Sheet" title="Google Sheet">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </header>
      <div id="platform-content" className="platform-content" tabIndex={-1}>{children}</div>
    </main>
    <ShellNavigation items={NAVIGATION} role={context.user.role} mode="bottom" onNavigate={() => setDrawerOpen(false)} />
  </div>;
}
