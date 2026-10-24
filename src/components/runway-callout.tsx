import { TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Money } from '@/components/ui/money';
import { formatMonthDay, formatCents } from '@/lib/format';
import { weekdayAbbr } from '@/lib/projection/dates';
import type { RunwayResult } from '@/lib/projection/types';

export interface RunwayCalloutProps {
  runway: RunwayResult | null;
  /** True when the available balance was estimated (Requirement 11.2). */
  isEstimated?: boolean;
  /** Projection horizon in days, used for the "within the next N days" label. */
  horizonDays: number;
  /** Whole days until the next paycheck; set only when the runway is bounded by it. */
  daysUntilPayday?: number | null;
  /** Set when the low balance warning fired; drives the amber chip. */
  belowThreshold?: { thresholdCents: number } | null;
  className?: string;
}

/** "Payday is today", "1 day until payday", or "N days until payday". */
export function paydayCountdown(days: number): string {
  if (days <= 0) return 'Payday is today';
  return days === 1 ? '1 day until payday' : `${days} days until payday`;
}

export function runwayLabel(isBeforePayday: boolean, horizonDays: number): string {
  return isBeforePayday ? 'before payday' : `within the next ${horizonDays} days`;
}

/** Hero runway number: lowest projected available balance and the date it occurs. */
export function RunwayCallout({
  runway,
  isEstimated = false,
  horizonDays,
  daysUntilPayday = null,
  belowThreshold = null,
  className,
}: RunwayCalloutProps) {
  if (!runway) {
    return (
      <Card className={className}>
        <section aria-labelledby="runway-heading" className="px-(--card-spacing)">
          <h2 id="runway-heading" className="text-base font-semibold">
            Your runway
          </h2>
          <p className="mt-2 text-muted-foreground">No runway available</p>
        </section>
      </Card>
    );
  }

  const negative = runway.lowestBalanceCents < 0;
  const dateLabel = `${weekdayAbbr(runway.lowestBalanceDate)}, ${formatMonthDay(runway.lowestBalanceDate)}`;
  const tail =
    daysUntilPayday !== null ? paydayCountdown(daysUntilPayday) : runwayLabel(runway.isBeforePayday, horizonDays);

  return (
    <Card className={className}>
      <section aria-labelledby="runway-heading" className="flex flex-col px-(--card-spacing)">
        <h2 id="runway-heading" className="text-base font-semibold">
          Your runway
        </h2>
        <p
          className="mt-3 text-5xl leading-none font-bold tracking-tight xl:text-6xl"
          data-negative={negative || undefined}
        >
          {/* Primary text color; red only when the balance is negative. */}
          <Money cents={runway.lowestBalanceCents} tone="auto" />
          {isEstimated && <span className="ml-2 text-base font-normal text-muted-foreground">(estimated)</span>}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Lowest on{' '}
          <time dateTime={runway.lowestBalanceDate} className="font-semibold text-foreground">
            {dateLabel}
          </time>{' '}
          · {tail}
        </p>
        {belowThreshold && (
          <div className="mt-4">
            <Chip variant="warning" className="px-3 py-1.5 text-sm">
              <TriangleAlert aria-hidden="true" />
              <span>Below your {formatCents(belowThreshold.thresholdCents)} threshold.</span>
            </Chip>
          </div>
        )}
      </section>
    </Card>
  );
}
