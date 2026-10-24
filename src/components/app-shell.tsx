'use client';

import { LogFlow } from '@/components/log-flow/log-flow';
import { LogFlowProvider } from '@/components/log-flow/log-flow-context';
import { ResetDemoButton } from '@/components/reset-demo-button';
import { MobileTabBar, Sidebar } from '@/components/sidebar';

export { NAV_ITEMS } from '@/components/sidebar';

/** Sidebar (md+) and bottom tab bar (<md) around every page. Pages render their own header. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LogFlowProvider>
      <div className="min-h-screen md:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="px-4 pt-4 text-lg font-bold tracking-tight md:hidden">Runway</p>
          <main className="mx-auto w-full max-w-page flex-1 px-4 pt-4 pb-6 md:p-8">{children}</main>
          <ResetDemoButton className="px-4 pb-24 md:hidden" />
        </div>
        <MobileTabBar />
      </div>
      <LogFlow />
    </LogFlowProvider>
  );
}