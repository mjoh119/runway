import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectBalances } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 16: Posted entries not double-applied
// **Validates: Requirements 6.3, 6.7**

const START = '2025-03-15';
const END = addDays(START, 30);

const baseEntryArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: 0, max: 30 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      status: fc.constantFrom('PLANNED', 'PENDING') as fc.Arbitrary<Entry['status']>,
    })
    .map(({ offset, amount, entryType, status }) => {
      const date = addDays(START, offset);
      return {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: null,
        status,
        entryType,
      };
    });

const baseEntriesArb = fc
  .integer({ min: 0, max: 8 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => baseEntryArb(`b${i}`))));

const balancesArb = fc.record({
  ledger: fc.integer({ min: -500_000, max: 500_000 }),
  available: fc.integer({ min: -500_000, max: 500_000 }),
});

// POSTED entry with no hold, or a hold that has already been released by START.
const postedNoHoldArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: -20, max: 40 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      actual: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      holdOffset: fc.option(fc.integer({ min: -10, max: 0 }), { nil: undefined }),
    })
    .map(({ offset, amount, actual, entryType, holdOffset }) => {
      const date = addDays(START, offset);
      const entry: Entry = {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: actual,
        status: 'POSTED',
        entryType,
      };
      if (holdOffset !== undefined && entryType === 'INCOME') {
        entry.holdReleaseDate = addDays(START, holdOffset);
      }
      return entry;
    });

const postedListArb = fc
  .integer({ min: 1, max: 6 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => postedNoHoldArb(`p${i}`))));

describe('Property 16: Posted entries not double-applied', () => {
  it('POSTED entries without a future hold leave ledger and available rows unchanged', () => {
    fc.assert(
      fc.property(balancesArb, baseEntriesArb, postedListArb, (bal, base, posted) => {
        const without = projectBalances(bal.ledger, bal.available, base, START, END);
        const withPosted = projectBalances(bal.ledger, bal.available, [...base, ...posted], START, END);
        expect(withPosted).toEqual(without);
      }),
      { numRuns: 100 },
    );
  });

  it('POSTED deposit with a future hold changes available once on release date, never ledger', () => {
    fc.assert(
      fc.property(
        balancesArb,
        baseEntriesArb,
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: -10, max: 30 }),
        (bal, base, amount, holdOffset, postOffset) => {
          const releaseDate = addDays(START, holdOffset);
          const postDate = addDays(START, postOffset);
          const held: Entry = {
            id: 'held',
            accountId: 'a1',
            scheduleId: null,
            postDate,
            shiftedPostDate: postDate,
            estimatedAmountCents: amount,
            actualAmountCents: null,
            status: 'POSTED',
            entryType: 'INCOME',
            holdReleaseDate: releaseDate,
          };

          const without = projectBalances(bal.ledger, bal.available, base, START, END);
          const withHeld = projectBalances(bal.ledger, bal.available, [...base, held], START, END);

          expect(withHeld).toHaveLength(without.length);
          withHeld.forEach((row, i) => {
            const ref = without[i];
            expect(row.date).toBe(ref.date);
            expect(row.ledgerBalanceCents).toBe(ref.ledgerBalanceCents);
            const expectedDelta = row.date >= releaseDate ? amount : 0;
            expect(row.availableBalanceCents - ref.availableBalanceCents).toBe(expectedDelta);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
