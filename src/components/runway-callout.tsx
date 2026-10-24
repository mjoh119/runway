import { formatCents, formatMonthDay } from '@/lib/format';
import type { RunwayResult } from '@/lib/projection/types';

export interface RunwayCalloutProps {
  runway: RunwayResult | null;
  /** True when the available balance was estimated (Requirement 11.2). */
  isEstimated?: boolean;
  /** Projection horizon in days, used for the "within the next N days" label. */
  horizonDays: number;
  /** Whole days until the next paycheck; set only when the runway is bounded by it. */
  daysUntilPayday?: number | null;
}

/** "today", "1 day until payday", or "N days until payday". */
export function paydayCountdown(days: number): string {
  if (days <= 0) return 'Payday is today';
  return days === 1 ? '1 day until payday' : `${days} days until payday`;
}

export function runwayLabel(isBeforePayday: boolean, horizonDays: number): string {
  return isBeforePayday ? 'before payday' : `within the next ${horizonDays} days`;
}

/** Hero runway number: lowest projected available balance and the date it occurs. */
export function RunwayCallout({ runway, isEstimated = false, horizonDays, daysUntilPayday = null }: RunwayCalloutProps) {
  if (!runway) {
    return (
      <section aria-labelledby="runway-heading" className="space-y-1">
        <h2 id="runway-heading" className="text-sm font-medium text-muted-foreground">
          Runway
        </h2>
        <p className="text-base text-muted-foreground">No runway available</p>
      </section>
    );
  }

  const negative = runway.lowestBalanceCents < 0;
  const amount = formatCents(runway.lowestBalanceCents);
  const date = formatMonthDay(runway.lowestBalanceDate);
  const label = runwayLabel(runway.isBeforePayday, horizonDays);

  return (
    <section aria-labelledby="runway-heading" className="space-y-1">
      <h2 id="runway-heading" className="text-sm font-medium text-muted-foreground">
        Runway
      </h2>
      <p className="text-4xl font-semibold tabular-nums" data-negative={negative || undefined}>
        <span className={negative ? 'text-destructive' : 'text-foreground'}>{amount}</span>
        {isEstimated && (
          <span className="ml-2 text-base font-normal text-muted-foreground">(estimated)</span>
        )}
      </p>
      <p className="text-base text-foreground">
        lowest on <time dateTime={runway.lowestBalanceDate}>{date}</time>, {label}
      </p>
      {daysUntilPayday !== null && (
        <p className="text-sm text-muted-foreground">{paydayCountdown(daysUntilPayday)}</p>
      )}
    </section>
  );
}
