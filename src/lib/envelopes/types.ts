/**
 * Envelope_Calculator types. Pure: no I/O. Money is integer cents.
 */

export type ResetPeriod = 'EACH_PAY_CYCLE' | 'WEEKLY' | 'MONTHLY';

/** Inclusive 'YYYY-MM-DD' range. */
export interface EnvelopePeriod {
  start: string;
  end: string;
}

export interface LineItemLike {
  id: string;
  amountCents: number;
  purchaseDate: string;
  description?: string | null;
}

export interface EnvelopeTotals {
  spentCents: number;
  leftCents: number;
  overageCents: number;
}
