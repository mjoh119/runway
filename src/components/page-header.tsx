import { TodayLabel } from '@/components/today-label';

/** Title and subtitle on the left, "Today is <date>" (and optional actions) on the right. Same on every page. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  /** Optional controls beside the date, e.g. the Log button. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl leading-8 font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4">
        <TodayLabel className="text-sm whitespace-nowrap text-muted-foreground" />
        {actions}
      </div>
    </header>
  );
}