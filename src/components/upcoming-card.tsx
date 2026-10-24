import Link from 'next/link';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Money } from '@/components/ui/money';
import { formatMonthDay } from '@/lib/format';
import type { CycleSummary, UpcomingGroup, UpcomingRow } from '@/lib/overview-view-model';
import { cn } from '@/lib/utils';

function Row({ row }: { row: UpcomingRow }) {
  const income = row.amountCents > 0;
  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3" data-testid="upcoming-row">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{row.description}</span>
          {row.status === 'overdue' && <Chip variant="overdue">Overdue</Chip>}
          {row.status === 'pending' && <Chip variant="pending">Pending</Chip>}
          {row.shifted && <Chip variant="neutral">{row.shifted.text}</Chip>}
        </div>
        {row.dueText && <p className="mt-0.5 text-xs text-muted-foreground">{row.dueText}</p>}
      </div>
      <Money
        cents={row.amountCents}
        showPlus
        tone={income ? 'income' : 'default'}
        className="shrink-0 text-sm font-semibold"
      />
    </li>
  );
}

function Summary({ summary }: { summary: CycleSummary }) {
  return (
    <section
      aria-label="This cycle"
      className="m-5 mt-auto rounded-lg bg-accent p-4"
      data-testid="cycle-summary"
    >
      <h3 className="text-sm font-semibold text-accent-foreground">
        This cycle · {formatMonthDay(summary.startDate)} – {formatMonthDay(summary.endDate)}
      </h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Planned out</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            <Money cents={summary.plannedOutCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Planned in</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            <Money cents={summary.plannedInCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Overdue</dt>
          <dd
            className={cn(
              'money mt-0.5 text-sm font-semibold',
              summary.overdueCount > 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {summary.overdueCount}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export interface UpcomingCardProps {
  groups: UpcomingGroup[];
  summary: CycleSummary | null;
  className?: string;
}

/** Upcoming entries grouped by settle date, with the current-cycle summary at the bottom. */
export function UpcomingCard({ groups, summary, className }: UpcomingCardProps) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="px-5 py-5">
        <CardTitle>
          <h2 id="upcoming-heading" className="text-base font-semibold">
            Upcoming
          </h2>
        </CardTitle>
        <CardAction>
          <Link href="/activity" className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </CardAction>
      </CardHeader>
      {groups.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No upcoming entries.</p>
      ) : (
        <div role="list" aria-labelledby="upcoming-heading">
          {groups.map((g) => (
            <div key={g.key} role="listitem">
              <h3
                className="bg-muted px-5 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground"
              >
                {g.label}
              </h3>
              <ul className="divide-y divide-border/60">
                {g.rows.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {summary && <Summary summary={summary} />}
    </Card>
  );
}
