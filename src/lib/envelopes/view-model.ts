import { computeEnvelopeTotals } from './totals';
import { periodContaining, precedingPeriod } from './period';
import type { EnvelopePeriod, LineItemLike, ResetPeriod } from './types';

export interface LineItemView {
  id: string;
  amountCents: number;
  purchaseDate: string;
  description: string | null;
}

export interface EnvelopeCardView {
  id: string;
  name: string;
  resetPeriod: ResetPeriod;
  budgetCents: number;
  period: EnvelopePeriod;
  spentCents: number;
  leftCents: number;
  overageCents: number;
  /** Equals overageCents: logging X > Left lowers the runway by exactly X - Left. */
  runwayImpactCents: number;
  /** Current-period items, newest first. */
  currentItems: LineItemView[];
  /** Preceding-period items, newest first; null when the period cannot be determined. */
  preceding: { period: EnvelopePeriod; items: LineItemView[] } | null;
}

function itemsIn(items: readonly LineItemLike[], period: EnvelopePeriod): LineItemView[] {
  return items
    .filter((i) => i.purchaseDate >= period.start && i.purchaseDate <= period.end)
    .map((i) => ({
      id: i.id,
      amountCents: i.amountCents,
      purchaseDate: i.purchaseDate,
      description: i.description ?? null,
    }))
    .sort((a, b) =>
      a.purchaseDate !== b.purchaseDate
        ? b.purchaseDate.localeCompare(a.purchaseDate)
        : b.id.localeCompare(a.id),
    );
}

/** Builds the Envelopes screen card for one envelope. Pure. */
export function buildEnvelopeCardView(args: {
  envelope: { id: string; name: string; resetPeriod: ResetPeriod; budgetCents: number };
  lineItems: readonly LineItemLike[];
  incomeDates: readonly string[];
  today: string;
}): EnvelopeCardView {
  const { envelope, lineItems, incomeDates, today } = args;
  const period = periodContaining(envelope.resetPeriod, today, incomeDates, today);
  const totals = computeEnvelopeTotals(envelope.budgetCents, lineItems, period);
  const prior = precedingPeriod(envelope.resetPeriod, period, incomeDates);

  return {
    id: envelope.id,
    name: envelope.name,
    resetPeriod: envelope.resetPeriod,
    budgetCents: envelope.budgetCents,
    period,
    spentCents: totals.spentCents,
    leftCents: totals.leftCents,
    overageCents: totals.overageCents,
    runwayImpactCents: totals.overageCents,
    currentItems: itemsIn(lineItems, period),
    preceding: prior ? { period: prior, items: itemsIn(lineItems, prior) } : null,
  };
}
