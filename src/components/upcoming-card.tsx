'use client';

import Link from 'next/link';
import { useState } from 'react';
import { postJson } from '@/components/log-flow/form-field';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { useSubmit } from '@/components/log-flow/use-submit';
import { AmountCell } from '@/components/ui/amount-cell';
import { Button } from '@/components/ui/button';
import { GroupedList } from '@/components/ui/grouped-list';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Money } from '@/components/ui/money';
import { formatMonthDay } from '@/lib/format';
import type { CycleSummary, UpcomingGroup, UpcomingRow } from '@/lib/overview-view-model';
import { cn } from '@/lib/utils';

function Row({ row }: { row: UpcomingRow }) {
  const { openLogFlow } = useLogFlow();
  // Skip posts straight away; success fires `runway:changed`, which refetches the page.
  const { submitting, error, submit } = useSubmit();
  const [today] = useState(() => new Date().toLocaleDateString('en-CA'));
  const skip = () => void submit(() => postJson('/api/entries/skip', { entryRef: row.id, today }));
  return (
    <div className="px-(--card-spacing) py-3" data-testid="upcoming-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{row.description}</span>
            {row.status === 'overdue' && <StatusBadge status="overdue" />}
            {row.status === 'pending' && <StatusBadge status="pending" />}
            {row.shifted && <StatusBadge status="moved" label={row.shifted.text} />}
          </div>
          {row.dueText && <p className="mt-0.5 text-xs text-muted-foreground">{row.dueText}</p>}
        </div>
        <AmountCell cents={row.amountCents} className="shrink-0" />
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={submitting}
          aria-label={`Post ${row.description}`}
          onClick={() => openLogFlow({ mode: 'post', entryRef: row.id })}
        >
          Post
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={submitting}
          aria-label={`Skip ${row.description}`}
          onClick={skip}
        >
          Skip
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Summary({ summary }: { summary: CycleSummary }) {
  return (
    <section
      aria-label="This cycle"
      className="mt-auto border-t border-border bg-muted/40 px-(--card-spacing) py-4"
      data-testid="cycle-summary"
    >
      <h3 className="text-sm font-semibold">
        This cycle &middot; {formatMonthDay(summary.startDate)} &ndash; {formatMonthDay(summary.endDate)}
      </h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Planned out</dt>
          <dd className="mt-0.5 text-base font-semibold">
            <Money cents={summary.plannedOutCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Planned in</dt>
          <dd className="mt-0.5 text-base font-semibold">
            <Money cents={summary.plannedInCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Overdue</dt>
          <dd
            className={cn(
              'money mt-0.5 text-base font-semibold',
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
    <SectionCard
      id="upcoming"
      title="Upcoming"
      className={className}
      flush
      action={
        <Link href="/activity" className="text-sm font-medium text-link hover:underline">
          See all
        </Link>
      }
      bodyClassName="flex flex-col"
    >
      {groups.length === 0 ? (
        <p className="px-(--card-spacing) pb-(--card-spacing) text-sm text-muted-foreground">No upcoming entries.</p>
      ) : (
        <GroupedList
          aria-labelledby="upcoming-heading"
          groups={groups.map((g) => ({ key: g.key, label: g.label, items: g.rows }))}
          itemKey={(r) => r.id}
          renderItem={(r) => <Row row={r} />}
        />
      )}
      {summary && <Summary summary={summary} />}
    </SectionCard>
  );
}