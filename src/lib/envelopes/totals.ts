import type { EnvelopePeriod, EnvelopeTotals, LineItemLike } from './types';

/**
 * Envelope totals for one period. Pure; integer cents.
 *
 * spent   = sum of line items with purchaseDate inside the period (inclusive)
 * left    = max(0, budget - spent)
 * overage = max(0, spent - budget)
 *
 * 'YYYY-MM-DD' strings compare chronologically as plain strings.
 */
export function computeEnvelopeTotals(
  budgetCents: number,
  lineItems: readonly LineItemLike[],
  period: EnvelopePeriod,
): EnvelopeTotals {
  let spentCents = 0;
  for (const item of lineItems) {
    if (item.purchaseDate >= period.start && item.purchaseDate <= period.end) {
      spentCents += item.amountCents;
    }
  }
  return {
    spentCents,
    leftCents: Math.max(0, budgetCents - spentCents),
    overageCents: Math.max(0, spentCents - budgetCents),
  };
}
