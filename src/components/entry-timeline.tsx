import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents, formatMonthDay } from '@/lib/format';
import type { Entry } from '@/lib/projection/types';

export interface EntryTimelineProps {
  /** Upcoming entries (shifted date on or after today). Re-sorted defensively by shifted date. */
  entries: Entry[];
  /** Overdue planned entries (Requirement 12.2); listed first with an "Overdue" flag. */
  overdueEntries?: Entry[];
}

function byShiftedDate(a: Entry, b: Entry): number {
  if (a.shiftedPostDate !== b.shiftedPostDate) return a.shiftedPostDate < b.shiftedPostDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function EntryRow({ entry, overdue }: { entry: Entry; overdue: boolean }) {
  const amount = entry.actualAmountCents ?? entry.estimatedAmountCents;
  const isEstimate = entry.actualAmountCents === null;
  const shifted = entry.shiftedPostDate !== entry.postDate;
  const title = entry.description ?? (entry.entryType === 'INCOME' ? 'Income' : 'Bill');

  return (
    <li className="flex items-start justify-between gap-4 py-3" data-testid="timeline-entry">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {entry.entryType === 'INCOME' ? 'Income' : 'Debit'}
          </span>
        </p>
        <p className="text-sm">
          <time dateTime={entry.shiftedPostDate}>{formatMonthDay(entry.shiftedPostDate)}</time>
          {shifted ? (
            <span className="text-muted-foreground">
              {' '}
              (shifted from <time dateTime={entry.postDate}>{formatMonthDay(entry.postDate)}</time>, weekend or
              bank holiday)
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {overdue ? (
            <span className="font-semibold text-destructive">Overdue: counted at its estimate</span>
          ) : null}
          {entry.status === 'PENDING' ? <span>Pending</span> : null}
          {isEstimate ? <span>Estimated amount</span> : null}
          {entry.holdReleaseDate ? (
            <span>
              Held until <time dateTime={entry.holdReleaseDate}>{formatMonthDay(entry.holdReleaseDate)}</time>
              {entry.isHoldEstimated ? ' (estimated)' : ''}
            </span>
          ) : null}
        </p>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">{formatCents(amount)}</p>
    </li>
  );
}

/** Upcoming entries ordered by shifted post date (Requirements 7.4, 6.9, 12.2, 13.3). */
export function EntryTimeline({ entries, overdueEntries = [] }: EntryTimelineProps) {
  const overdueIds = new Set(overdueEntries.map((e) => e.id));
  const overdue = [...overdueEntries].sort(byShiftedDate);
  const upcoming = entries.filter((e) => !overdueIds.has(e.id)).sort(byShiftedDate);
  const hasAny = overdue.length + upcoming.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="entry-timeline-heading">Upcoming entries</h2>
        </CardTitle>
        <CardDescription>Ordered by the date each entry actually settles.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasAny ? (
          <ul aria-labelledby="entry-timeline-heading" className="divide-y">
            {overdue.map((e) => (
              <EntryRow key={e.id} entry={e} overdue />
            ))}
            {upcoming.map((e) => (
              <EntryRow key={e.id} entry={e} overdue={false} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming entries.</p>
        )}
      </CardContent>
    </Card>
  );
}
