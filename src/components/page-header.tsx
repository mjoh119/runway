import { TodayLabel } from '@/components/today-label';
import { cn } from '@/lib/utils';

/** Desktop page header (hidden on mobile, where the shell shows a compact bar instead). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  /** Optional controls shown beside the date, e.g. the Log button. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 hidden items-start justify-between gap-4 md:flex">
      <div>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4">
        <TodayLabel className="text-sm text-muted-foreground" />
        {actions}
      </div>
    </header>
  );
}

/** Mobile-only page title, so each route still has an h1 under the compact bar. */
export function MobileTitle({ title, className }: { title: string; className?: string }) {
  return <h1 className={cn('mb-4 text-2xl font-bold tracking-tight md:hidden', className)}>{title}</h1>;
}
