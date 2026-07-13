'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '../../lib/platform/types';

type NavigationIcon = 'home' | 'reports' | 'manage' | 'catalog' | 'cashflow' | 'settings';
export type NavigationItem = { href: string; label: string; icon: NavigationIcon; roles: AppRole[]; bottomRoles: AppRole[]; aliases?: string[] };

function NavIcon({ icon }: { icon: NavigationIcon }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (icon === 'home') return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (icon === 'reports') return <svg {...common}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  if (icon === 'manage') return <svg {...common}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>;
  if (icon === 'catalog') return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
  if (icon === 'cashflow') return <svg {...common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"/></svg>;
}

export function ShellNavigation({ items, role, mode = 'side', onNavigate }: { items: NavigationItem[]; role: AppRole; mode?: 'side' | 'bottom'; onNavigate?: () => void }) {
  const pathname = usePathname();
  const visible = items.filter((item) => (mode === 'bottom' ? item.bottomRoles : item.roles).includes(role));
  return <nav className={mode === 'bottom' ? 'platform-bottom-nav' : 'platform-nav'} aria-label={mode === 'bottom' ? 'Điều hướng nhanh' : 'Điều hướng chính'}>
    {visible.map((item) => {
      const active = pathname === item.href || pathname?.endsWith(`${item.href}/`) || Boolean(item.aliases?.includes(pathname || ''));
      return <Link key={item.href} href={item.href} prefetch={false} className="platform-nav-link" aria-current={active ? 'page' : undefined} aria-label={item.label} onClick={onNavigate}>
        <span className="platform-nav-icon"><NavIcon icon={item.icon} /></span>
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
