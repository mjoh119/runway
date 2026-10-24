import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectBalances } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 15: Daily balance projection
// **Validates: Requirements 6.1**

const BASE = '2025-01-01';

const dateArb = fc.integer({ min: 0, max: 800 }).map((n) => addDays(BASE, n));

const entryArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      date: fc.integer({ min: -60, max: 900 }).map((n) => addDays(BASE, n)),
      amount: fc.integer({ min: 1, max: 100_000 }),
      actual: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      status: fc.constantFrom('PLANNED', 'PENDING', 'POSTED', 'SKIPPED') as fc.Arbitrary<
        Entry['status']
      >,
    })
    .map(({ date, amount, actual, entryType, status }) => ({
      id,
      accountId: 'a1',
      scheduleId: null,
      postDate: date,
      shiftedPostDate: date,
      estimatedAmountCents: amount,
      actualAmountCents: actual,
      status,
      entryType,
    }));

const entriesArb = fc
  .integer({ min: 0, max: 10 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryArb(`e${i}`))));

const ledgerArb = fc.integer({ min: -1_000_000, max: 1_000_000 });
const availableArb = fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null });

describe('Property 15: Daily balance projection', () => {
  it('returns exactly one consecutive row per day, inclusive of start and end', () => {
    fc.assert(
      fc.property(
        ledgerArb,
        availableArb,
        entriesArb,
        dateArb,
        fc.integer({ min: 0, max: 400 }),
        (ledger, available, entries, start, span) => {
          const end = addDays(start, span);
          const rows = projectBalances(ledger, available, entries, start, end);

          expect(rows).toHaveLength(span + 1);
          expect(rows[0].date).toBe(start);
          expect(rows[rows.length - 1].date).toBe(end);
          rows.forEach((row, i) => {
            expect(row.date).toBe(addDays(start, i));
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns an empty array when end is before start', () => {
    fc.assert(
      fc.property(
        ledgerArb,
        availableArb,
        entriesArb,
        dateArb,
        fc.integer({ min: 1, max: 400 }),
        (ledger, available, entries, start, gap) => {
          const end = addDays(start, -gap);
          expect(projectBalances(ledger, available, entries, start, end)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
