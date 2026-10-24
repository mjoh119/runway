// Warnings for the cycle view. Pure: no I/O, no side effects.

import { formatMonthDay, formatWholeDollars } from '../format';
import type { BalanceDifferenceItem, Entry, ProjectionOutput, RunwayResult } from './types';

export interface BuildWarningsInput {
  runway: RunwayResult | null;
  /** Low-balance threshold in integer cents; null/undefined when unset. */
  thresholdCents: number | null | undefined;
  /** All entries in the projection (generated + one-off). */
  entries: Entry[];
  /** Projection start date, 'YYYY-MM-DD'. */
  startDate: string;
  startingLedgerCents: number;
  /** Reported available balance; null when the institution doesn't report one. */
  startingAvailableCents: number | null;
}

type Warnings = ProjectionOutput['warnings'];

const amountOf = (e: Entry): number =>
  Math.abs(e.actualAmountCents ?? e.estimatedAmountCents);

/** Planned entries dated before the start with no actual amount (Req 12.2). */
export function findOverdueEntries(entries: Entry[], startDate: string): Entry[] {
  return entries.filter(
    (e) =>
      e.status === 'PLANNED' &&
      e.actualAmountCents === null &&
      e.shiftedPostDate < startDate,
  );
}

/**
 * One-line cause of the ledger/available gap, or undefined when they match.
 * Causes: pending debits (in available, not yet in ledger) and posted deposits
 * still on hold (in ledger, not yet in available).
 */
export function explainBalanceDifference(
  entries: Entry[],
  startDate: string,
  startingLedgerCents: number,
  startingAvailableCents: number | null,
): string | undefined {
  const pendingDebitCents = entries
    .filter((e) => e.status === 'PENDING' && e.entryType === 'DEBIT')
    .reduce((sum, e) => sum + amountOf(e), 0);

  // Deposit already in the ledger whose hold has not released yet.
  const holdsByDate = new Map<string, number>();
  for (const e of entries) {
    if (
      e.status === 'POSTED' &&
      e.entryType === 'INCOME' &&
      e.holdReleaseDate !== undefined &&
      e.holdReleaseDate > startDate
    ) {
      holdsByDate.set(e.holdReleaseDate, (holdsByDate.get(e.holdReleaseDate) ?? 0) + amountOf(e));
    }
  }

  const parts: string[] = [];
  if (pendingDebitCents > 0) parts.push(`${formatWholeDollars(pendingDebitCents)} pending debit`);
  for (const date of [...holdsByDate.keys()].sort()) {
    parts.push(`${formatWholeDollars(holdsByDate.get(date)!)} deposit on hold until ${formatMonthDay(date)}`);
  }

  // A null available balance is estimated from these same items, so any item is a difference.
  if (startingAvailableCents === null) {
    return parts.length > 0 ? parts.join(' and ') : undefined;
  }
  if (startingAvailableCents === startingLedgerCents) return undefined;
  if (parts.length > 0) return parts.join(' and ');

  // Gap with no identifiable item: still say something specific.
  const gap = Math.abs(startingLedgerCents - startingAvailableCents);
  return `${formatWholeDollars(gap)} difference between ledger and available balance`;
}

/**
 * The individual items behind the ledger/available gap: pending debits first (entry order),
 * then posted deposits still on hold, ordered by release date. Same selection as
 * explainBalanceDifference.
 */
export function listBalanceDifferenceItems(entries: Entry[], startDate: string): BalanceDifferenceItem[] {
  const pending: BalanceDifferenceItem[] = entries
    .filter((e) => e.status === 'PENDING' && e.entryType === 'DEBIT')
    .map((e) => ({ description: e.description ?? 'Pending debit', amountCents: amountOf(e), kind: 'Pending' }));
  const held: BalanceDifferenceItem[] = entries
    .filter(
      (e) =>
        e.status === 'POSTED' &&
        e.entryType === 'INCOME' &&
        e.holdReleaseDate !== undefined &&
        e.holdReleaseDate > startDate,
    )
    .map((e) => ({
      description: e.description ?? 'Deposit',
      amountCents: amountOf(e),
      kind: 'On hold' as const,
      holdReleaseDate: e.holdReleaseDate,
    }))
    .sort((a, b) => (a.holdReleaseDate! < b.holdReleaseDate! ? -1 : a.holdReleaseDate! > b.holdReleaseDate! ? 1 : 0));
  return [...pending, ...held];
}

/** Requirements 10.1, 10.2, 10.4, 12.2, 13.4. */
export function buildWarnings(input: BuildWarningsInput): Warnings {
  const { runway, thresholdCents, entries, startDate, startingLedgerCents, startingAvailableCents } = input;
  const warnings: Warnings = {};

  if (runway) {
    const hasThreshold = thresholdCents !== null && thresholdCents !== undefined;
    const belowThreshold = hasThreshold && runway.lowestBalanceCents < thresholdCents;
    if (belowThreshold || runway.lowestBalanceCents < 0) {
      warnings.belowThreshold = {
        thresholdCents: hasThreshold ? thresholdCents : 0,
        lowestBalanceCents: runway.lowestBalanceCents,
        date: runway.lowestBalanceDate,
      };
    }
  }

  const overdue = findOverdueEntries(entries, startDate);
  if (overdue.length > 0) warnings.overdueEntries = overdue;

  const reason = explainBalanceDifference(entries, startDate, startingLedgerCents, startingAvailableCents);
  if (reason !== undefined) warnings.availableBalanceDifference = { reason, items: listBalanceDifferenceItems(entries, startDate) };

  return warnings;
}
