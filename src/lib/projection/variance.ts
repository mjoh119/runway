// Variance: actual minus estimate, in integer cents. Pure, no I/O.

import type { Entry } from './types';

export interface VarianceRow {
  id: string;
  description: string;
  /** Signed integer cents. */
  estimatedCents: number;
  /** Signed integer cents. */
  actualCents: number;
  /** actual - estimate, signed. */
  varianceCents: number;
  actualDate: string;
}

export interface CumulativeVariance {
  rows: VarianceRow[];
  totalCents: number;
}

/** Sign comes from entryType, magnitude from the stored amount. */
function signed(entryType: Entry['entryType'], cents: number): number {
  const magnitude = Math.abs(cents);
  return entryType === 'INCOME' ? magnitude : -magnitude;
}

function actualOf(entry: Entry): number {
  // A POSTED entry without an actual amount settled at its estimate.
  return signed(entry.entryType, entry.actualAmountCents ?? entry.estimatedAmountCents);
}

/** Signed actual minus signed estimate. Negative means less cash than planned. */
export function entryVariance(entry: Entry): number {
  return actualOf(entry) - signed(entry.entryType, entry.estimatedAmountCents);
}

/**
 * Sum of variance over POSTED entries whose actual date (falling back to
 * postDate) lies inside the cycle, inclusive. Rows are sorted by actual date, then id.
 */
export function computeCumulativeVariance(
  entries: readonly Entry[],
  cycle: { startDate: string; endDate: string },
): CumulativeVariance {
  const rows: VarianceRow[] = [];
  for (const entry of entries) {
    if (entry.status !== 'POSTED') continue;
    const actualDate = entry.actualDate ?? entry.postDate;
    if (actualDate < cycle.startDate || actualDate > cycle.endDate) continue;
    rows.push({
      id: entry.id,
      description: entry.description ?? '',
      estimatedCents: signed(entry.entryType, entry.estimatedAmountCents),
      actualCents: actualOf(entry),
      varianceCents: entryVariance(entry),
      actualDate,
    });
  }
  rows.sort((a, b) =>
    a.actualDate === b.actualDate ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.actualDate < b.actualDate ? -1 : 1,
  );
  let totalCents = 0;
  for (const row of rows) totalCents += row.varianceCents;
  return { rows, totalCents };
}
