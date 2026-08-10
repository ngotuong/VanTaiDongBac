'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalizeRoutePath, routesEqual } from '../../lib/platform/routes';
import type { AppRole } from '../../lib/platform/types';

type NavigationIcon = 'home' | 'reports' | 'manage' | 'catalog' | 'cashflow' | 'settings';
export type NavigationItem = { href: string; label: string; icon: NavigationIcon; roles: AppRole[]; bottomRoles: AppRole[]; aliases?: string[] };
const PREFETCHED_ROUTES = new Set<string>();

function NavIcon({ icon }: { icon: NavigationIcon }) {
  const common = { className: 'btn-svg', viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  if (icon === 'home') return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (icon === 'reports') return <svg {...common}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  if (icon === 'manage') return <svg {...common}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>;
  if (icon === 'catalog') return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
  if (icon === 'cashflow') return <svg {...common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"/></svg>;
}

export function ShellNavigation({ items, role, mode = 'side', pendingHref = '', onNavigate }: { items: NavigationItem[]; role: AppRole; mode?: 'side' | 'bottom'; pendingHref?: string; onNavigate: (href: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = normalizeRoutePath(pathname);
  const [scrollState, setScrollState] = useState({ path: currentPath, hidden: false });
  const navHidden = mode === 'bottom' && scrollState.path === currentPath && scrollState.hidden;
  const visible = items.filter((item) => (mode === 'bottom' ? item.bottomRoles : item.roles).includes(role));

  useEffect(() => {
    if (mode !== 'bottom') return;
    let lastScrollY = window.scrollY;
    let accumulatedDelta = 0;
    let frame = 0;
    const threshold = 15;
    const setHidden = (hidden: boolean) => setScrollState((state) => state.path === currentPath && state.hidden === hidden ? state : { path: currentPath, hidden });
    const update = () => {
      frame = 0;
      const currentScrollY = window.scrollY;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (currentScrollY < 0 || currentScrollY > maxScrollY) { lastScrollY = currentScrollY; return; }
      accumulatedDelta += currentScrollY - lastScrollY;
      if (currentScrollY <= 10) { setHidden(false); accumulatedDelta = 0; }
      else if (currentScrollY >= maxScrollY - 60) { setHidden(true); accumulatedDelta = 0; }
      else if (accumulatedDelta > threshold && currentScrollY > 80) { setHidden(true); accumulatedDelta = 0; }
      else if (accumulatedDelta < -threshold) { setHidden(false); accumulatedDelta = 0; }
      lastScrollY = currentScrollY;
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, [currentPath, mode]);

  const prepare = (href: string) => {
    if (routesEqual(href, currentPath) || PREFETCHED_ROUTES.has(href)) return;
    PREFETCHED_ROUTES.add(href);
    router.prefetch(href);
  };
  useEffect(() => {
    if (mode !== 'side') return;
    const targets = items
      .filter((item) => item.roles.includes(role) && !routesEqual(item.href, currentPath))
      .map((item) => item.href);
    const timers = targets.map((href, index) => window.setTimeout(() => {
      if (PREFETCHED_ROUTES.has(href)) return;
      PREFETCHED_ROUTES.add(href);
      router.prefetch(href);
    }, 250 + index * 350));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [currentPath, items, mode, role, router]);
  return <nav className={`${mode === 'bottom' ? 'bottom-nav' : 'nav-stack'}${navHidden ? ' nav-hidden' : ''}`} aria-label={mode === 'bottom' ? 'Điều hướng nhanh' : 'Điều hướng chính'}>
    {visible.map((item) => {
      const optimisticPath = normalizeRoutePath(pendingHref || currentPath);
      const active = routesEqual(optimisticPath, item.href) || Boolean(item.aliases?.some((alias) => routesEqual(alias, optimisticPath)));
      const pending = Boolean(pendingHref) && routesEqual(pendingHref, item.href);
      return <button key={item.href} type="button" className={`${mode === 'bottom' ? (active ? 'active' : '') : `nav-btn${active ? ' active' : ''}`}${pending ? ' nav-pending' : ''}`.trim()} aria-current={active ? 'page' : undefined} aria-label={pending ? `Đang mở ${item.label}` : item.label} aria-busy={pending || undefined} aria-disabled={pending || undefined} onPointerEnter={() => prepare(item.href)} onPointerDown={() => prepare(item.href)} onFocus={() => prepare(item.href)} onClick={() => { if (!pending) onNavigate(item.href); }}>
        {mode === 'side' ? <><span className="nav-ico"><NavIcon icon={item.icon}/></span><span className="nav-main">{item.label}</span></> : <><NavIcon icon={item.icon}/><span>{item.label}</span></>}
      </button>;
    })}
  </nav>;
}
