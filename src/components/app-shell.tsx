'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Settings, Wallet, type LucideIcon } from 'lucide-react';
import { LogFlow } from '@/components/log-flow/log-flow';
import { LogFlowProvider } from '@/components/log-flow/log-flow-context';
import { ResetDemoButton } from '@/components/reset-demo-button';
import { TodayLabel } from '@/components/today-label';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/envelopes', label: 'Envelopes', icon: Wallet },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar (md+) and bottom tab bar (<md) around every page. Pages render their own header. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <LogFlowProvider>
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-50 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex">
        <p className="px-3 text-xl font-bold tracking-tight">Runway</p>
        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-muted',
                )}
              >
                <Icon className="size-4.5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <ResetDemoButton className="mt-auto px-3" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pt-4 md:hidden">
          <p className="text-lg font-bold tracking-tight">Runway</p>
          <TodayLabel className="text-xs text-muted-foreground" />
        </div>
        <main className="flex-1 px-4 pt-4 pb-6 md:px-8 md:py-8">{children}</main>
        <ResetDemoButton className="px-4 pb-24 md:hidden" />
      </div>

      <nav
        aria-label="Tab bar"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
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
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
    <LogFlow />
    </LogFlowProvider>
  );
}
