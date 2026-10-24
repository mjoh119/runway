import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectBalances, projectCashFlow } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 36: Estimated balance labeled
// **Validates: Requirements 11.2**

const BASE = '2025-01-01';

const entryArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      date: fc.integer({ min: -30, max: 120 }).map((n) => addDays(BASE, n)),
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
  .integer({ min: 0, max: 8 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryArb(`e${i}`))));

const ledgerArb = fc.integer({ min: -1_000_000, max: 1_000_000 });
const availableArb = fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null });

describe('Property 36: Estimated balance labeled', () => {
  it('projectBalances rows are estimated iff the starting available balance is null', () => {
    fc.assert(
      fc.property(
        ledgerArb,
        availableArb,
        entriesArb,
        fc.integer({ min: 0, max: 400 }).map((n) => addDays(BASE, n)),
        fc.integer({ min: 0, max: 120 }),
        (ledger, available, entries, start, span) => {
          const rows = projectBalances(ledger, available, entries, start, addDays(start, span));
          expect(rows.length).toBeGreaterThan(0);
          for (const row of rows) {
            expect(row.isEstimated).toBe(available === null);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('projectCashFlow balances for the primary account carry the same label', () => {
    fc.assert(
      fc.property(
        ledgerArb,
        availableArb,
        entriesArb,
        fc.integer({ min: 1, max: 90 }),
        (ledger, available, entries, horizon) => {
          const out = projectCashFlow({
            accounts: [
              {
                id: 'a1',
                isPrimary: true,
                ledgerBalanceCents: ledger,
                availableBalanceCents: available,
              },
            ],
            schedules: [],
            oneOffEntries: entries,
            holidays: [],
            currentDate: BASE,
            projectionHorizonDays: horizon,
          });
          expect(out.balances.length).toBeGreaterThan(0);
          for (const row of out.balances) {
            expect(row.isEstimated).toBe(available === null);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
