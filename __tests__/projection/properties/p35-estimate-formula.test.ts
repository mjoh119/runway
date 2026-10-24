import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { estimateAvailableBalance, projectBalances } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 35: Available balance estimation
// **Validates: Requirements 11.1, 11.3**

const AS_OF = '2025-03-15';
const END = addDays(AS_OF, 30);

const amountOf = (e: Entry): number => e.actualAmountCents ?? e.estimatedAmountCents;

// minOffset lets the projection test keep PLANNED/PENDING events strictly after the start date.
const entryArb = (id: string, minOffset: number): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: minOffset, max: 30 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      actual: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      status: fc.constantFrom('PLANNED', 'PENDING', 'POSTED', 'SKIPPED') as fc.Arbitrary<
        Entry['status']
      >,
      holdOffset: fc.option(fc.integer({ min: -10, max: 30 }), { nil: undefined }),
    })
    .map(({ offset, amount, actual, entryType, status, holdOffset }) => {
      const date = addDays(AS_OF, status === 'POSTED' ? Math.min(offset, 0) : offset);
      const entry: Entry = {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: actual,
        status,
        entryType,
      };
      if (holdOffset !== undefined && entryType === 'INCOME') {
        entry.holdReleaseDate = addDays(AS_OF, holdOffset);
      }
      return entry;
    });

const entriesArb = (minOffset: number): fc.Arbitrary<Entry[]> =>
  fc
    .integer({ min: 0, max: 10 })
    .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryArb(`e${i}`, minOffset))));

const ledgerArb = fc.integer({ min: -500_000, max: 500_000 });

// Independent computation of the expected estimate.
function expectedEstimate(ledger: number, entries: Entry[], asOf: string): number {
  const pendingDebits = entries
    .filter((e) => e.status === 'PENDING' && e.entryType === 'DEBIT')
    .reduce((sum, e) => sum + amountOf(e), 0);
  const heldDeposits = entries
    .filter(
      (e) =>
        e.status === 'POSTED' &&
        e.entryType === 'INCOME' &&
        e.holdReleaseDate !== undefined &&
        e.holdReleaseDate > asOf,
    )
    .reduce((sum, e) => sum + amountOf(e), 0);
  return ledger - pendingDebits - heldDeposits;
}

describe('Property 35: Available balance estimation', () => {
  it('estimate equals ledger minus pending debits minus held posted deposits', () => {
    fc.assert(
      fc.property(ledgerArb, entriesArb(-20), (ledger, entries) => {
        expect(estimateAvailableBalance(ledger, entries, AS_OF)).toBe(
          expectedEstimate(ledger, entries, AS_OF),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('projectBalances with null available starts its first row from the estimate', () => {
    fc.assert(
      fc.property(ledgerArb, entriesArb(1), (ledger, entries) => {
        const rows = projectBalances(ledger, null, entries, AS_OF, END);
        expect(rows[0].date).toBe(AS_OF);
        expect(rows[0].isEstimated).toBe(true);
        expect(rows[0].availableBalanceCents).toBe(expectedEstimate(ledger, entries, AS_OF));
      }),
      { numRuns: 100 },
    );
  });
});
