import type { ProjectedBalance, RunwayResult } from './types';

/**
 * Compute runway: the lowest projected available balance and the date it occurs.
 *
 * - With a next income date: considers balances strictly before that date
 *   ("before payday").
 * - Without one: considers balances through projectionEndDate inclusive
 *   ("within the horizon").
 * - Ties resolve to the earliest date.
 * - Returns null when there is nothing to evaluate (no primary account
 *   means the caller passes no balances).
 *
 * Pure function: no I/O. Dates are 'YYYY-MM-DD' strings, which compare
 * correctly as strings.
 */
export function computeRunway(
  balances: ProjectedBalance[],
  nextIncomeDate: string | null,
  projectionEndDate: string,
): RunwayResult | null {
  const isBeforePayday = nextIncomeDate !== null;

  let lowest: ProjectedBalance | null = null;
  for (const b of balances) {
    const inWindow = isBeforePayday
      ? b.date < nextIncomeDate
      : b.date <= projectionEndDate;
    if (!inWindow) continue;

    if (
      lowest === null ||
      b.availableBalanceCents < lowest.availableBalanceCents ||
      (b.availableBalanceCents === lowest.availableBalanceCents && b.date < lowest.date)
    ) {
      lowest = b;
    }
  }

  if (lowest === null) return null;

  return {
    lowestBalanceCents: lowest.availableBalanceCents,
    lowestBalanceDate: lowest.date,
    isBeforePayday,
    projectionEndDate,
  };
}
