'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '../../lib/platform/types';

export type NavigationItem = { href: string; label: string; roles: AppRole[] };

export function ShellNavigation({ items, role }: { items: NavigationItem[]; role: AppRole }) {
  const pathname = usePathname();
  return <nav className="platform-nav" aria-label="Điều hướng Next.js">
    {items.filter((item) => item.roles.includes(role)).map((item) => {
      const active = pathname === item.href || pathname?.endsWith(`${item.href}/`);
      return <Link key={item.href} href={item.href} className="platform-nav-link" aria-current={active ? 'page' : undefined}>
        <span className="platform-nav-dot" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
