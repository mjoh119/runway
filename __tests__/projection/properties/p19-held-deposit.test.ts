import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectBalances } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 19: Held deposit splits into ledger and available
// **Validates: Requirements 6.6**

const START = '2025-03-01';

describe('Property 19: held deposit splits into ledger and available', () => {
  it('a planned income with hold h > d raises ledger from d and available only from h, by exactly the amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 60 }), // span in days
        fc.nat({ max: 1000 }), // post date offset seed
        fc.nat({ max: 1000 }), // hold offset seed
        fc.integer({ min: -1_000_000, max: 1_000_000 }), // starting ledger
        fc.integer({ min: -1_000_000, max: 1_000_000 }), // starting available
        fc.integer({ min: 1, max: 1_000_000 }), // amount
        (span, dSeed, hSeed, ledger, available, amount) => {
          const end = addDays(START, span);
          // d in [0, span-1], h in (d, span]
          const dOff = dSeed % span;
          const hOff = dOff + 1 + (hSeed % (span - dOff));
          const d = addDays(START, dOff);
          const h = addDays(START, hOff);
          const entry: Entry = {
            id: 'income-1',
            accountId: 'a1',
            scheduleId: null,
            postDate: d,
            shiftedPostDate: d,
            estimatedAmountCents: amount,
            actualAmountCents: null,
            status: 'PLANNED',
            entryType: 'INCOME',
            holdReleaseDate: h,
          };

          const rows = projectBalances(ledger, available, [entry], START, end);

          expect(rows).toHaveLength(span + 1);
          for (const row of rows) {
            expect(row.ledgerBalanceCents).toBe(ledger + (row.date >= d ? amount : 0));
            expect(row.availableBalanceCents).toBe(available + (row.date >= h ? amount : 0));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
