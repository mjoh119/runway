/**
 * Preview of how posting an actual amount moves the runway. Pure; integer cents.
 *
 * Posting at a different amount shifts every projected balance from the entry's date
 * onward by the variance (actual minus estimate, signed by direction). The runway is the
 * lowest projected balance, so it shifts by the same amount when the entry falls on or
 * before the lowest-balance date, and stays put when the entry falls after it.
 */
export interface RunwayImpactInput {
  entryType: 'INCOME' | 'DEBIT';
  /** Planned amount, any sign. */
  estimateCents: number;
  /** Amount being posted, any sign. */
  actualCents: number;
  /** The entry's projected date, YYYY-MM-DD. */
  entryDate: string;
  runway: { lowestBalanceCents: number; lowestBalanceDate: string } | null;
}

export type RunwayImpact =
  | { kind: 'unknown' }
  | { kind: 'unchanged'; reason: 'matches-estimate' | 'after-lowest'; runwayCents: number }
  | { kind: 'lower' | 'higher'; runwayCents: number; deltaCents: number };

export function runwayImpact(input: RunwayImpactInput): RunwayImpact {
  const { runway } = input;
  if (!runway) return { kind: 'unknown' };
  const sign = input.entryType === 'INCOME' ? 1 : -1;
  const variance = sign * (Math.abs(input.actualCents) - Math.abs(input.estimateCents));
  if (variance === 0) {
    return { kind: 'unchanged', reason: 'matches-estimate', runwayCents: runway.lowestBalanceCents };
  }
  if (input.entryDate > runway.lowestBalanceDate) {
    return { kind: 'unchanged', reason: 'after-lowest', runwayCents: runway.lowestBalanceCents };
  }
  return {
    kind: variance < 0 ? 'lower' : 'higher',
    runwayCents: runway.lowestBalanceCents + variance,
    deltaCents: Math.abs(variance),
  };
}