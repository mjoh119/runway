import { TodayLabel } from '@/components/today-label';

/** Desktop page header (hidden on mobile, where the shell shows a compact bar instead). */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-6 hidden items-start justify-between gap-4 md:flex">
      <div>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <TodayLabel className="pt-2 text-sm text-muted-foreground" />
    </header>
  );
}

/** Mobile-only page title, so each route still has an h1 under the compact bar. */
export function MobileTitle({ title }: { title: string }) {
  return <h1 className="mb-4 text-2xl font-bold tracking-tight md:hidden">{title}</h1>;
}
