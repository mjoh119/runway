// Pure view-model helper for the cycle view. No I/O, inputs are not mutated.
// Money is integer cents; dates are 'YYYY-MM-DD' strings.

import type { PayCycle, ProjectionOutput } from './projection/types';

export interface ChartPoint {
  date: string; // 'YYYY-MM-DD'
  availableCents: number; // primary line
  ledgerCents: number; // secondary line
  isEstimated: boolean;
}

export interface CycleBoundary {
  date: string; // first day of the pay cycle
  incomeEntryId: string | null;
}

export interface CycleViewModel {
  /** One point per day, covering the current and next pay cycles (or the full horizon). */
  series: ChartPoint[];
  /** Start dates of cycles inside the charted span (for boundary markers). */
  boundaries: CycleBoundary[];
  /** Charted span, or null when there is nothing to chart. */
  range: { start: string; end: string } | null;
  /** True when the chart fell back to the full horizon (no cycles). */
  isFullHorizon: boolean;
  /** "before payday" or "within the next N days"; null when there is no runway. */
  runwayLabel: string | null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Runway label text. `horizonDays` is N in "within the next N days". */
export function runwayLabel(isBeforePayday: boolean, horizonDays: number): string {
  return isBeforePayday ? 'before payday' : `within the next ${horizonDays} days`;
}

/**
 * Build the cycle view model from a projection.
 *
 * @param horizonDays Projection horizon in days (N in the label). When omitted,
 *   N is derived from the projection span (first balance date to runway end date).
 */
export function buildCycleViewModel(
  projection: Pick<ProjectionOutput, 'balances' | 'runway' | 'payCycles'>,
  horizonDays?: number,
): CycleViewModel {
  const { balances, runway, payCycles } = projection;

  const n =
    horizonDays ??
    (balances.length > 0 && runway
      ? Math.max(0, dayNumber(runway.projectionEndDate) - dayNumber(balances[0].date))
      : balances.length);

  const label = runway ? runwayLabel(runway.isBeforePayday, n) : null;

  // Current cycle = first, next cycle = second (or the current one if only one exists).
  const cycles: PayCycle[] = payCycles.slice(0, 2);
  const isFullHorizon = cycles.length === 0;

  const start = isFullHorizon ? balances[0]?.date : cycles[0].startDate;
  const end = isFullHorizon ? balances[balances.length - 1]?.date : cycles[cycles.length - 1].endDate;

  const sliced = isFullHorizon
    ? balances
    : balances.filter((b) => b.date >= start && b.date <= end);

  const series: ChartPoint[] = sliced.map((b) => ({
    date: b.date,
    availableCents: b.availableBalanceCents,
    ledgerCents: b.ledgerBalanceCents,
    isEstimated: b.isEstimated,
  }));

  const boundaries: CycleBoundary[] = cycles
    .filter((c) => series.length > 0 && c.startDate >= series[0].date && c.startDate <= series[series.length - 1].date)
    .map((c) => ({ date: c.startDate, incomeEntryId: c.incomeEntryId }));

  return {
    series,
    boundaries,
    range: series.length > 0 ? { start: series[0].date, end: series[series.length - 1].date } : null,
    isFullHorizon,
    runwayLabel: label,
  };
}
