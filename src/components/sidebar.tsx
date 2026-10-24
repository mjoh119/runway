'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, LayoutDashboard, Settings, Wallet, type LucideIcon } from 'lucide-react';
import { ResetDemoButton } from '@/components/reset-demo-button';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/envelopes', label: 'Envelopes', icon: Wallet },
  { href: '/activity', label: 'Log', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar: brand, nav with a clear active state, and "Demo data - Reset" at the bottom. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <p className="px-3 text-2xl font-bold tracking-tight">Runway</p>
      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                active
                  ? 'border-ring bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'border-transparent text-sidebar-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      <ResetDemoButton className="mt-auto px-3" />
    </aside>
  );
}

/** Mobile bottom tab bar, same tokens as the sidebar. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Tab bar"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 py-2 text-xs font-medium',
              active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}