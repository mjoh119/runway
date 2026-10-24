import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectBalances } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 18: Simple deposit increases both balances
// **Validates: Requirements 6.5**

const START = '2025-03-01';

describe('Property 18: simple deposit increases both balances', () => {
  it('a planned income without a hold raises ledger and available by its amount from its date onward, not before', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }), // span in days
        fc.nat({ max: 60 }), // deposit offset (clamped into span)
        fc.integer({ min: -1_000_000, max: 1_000_000 }), // starting ledger
        fc.integer({ min: -1_000_000, max: 1_000_000 }), // starting available
        fc.integer({ min: 1, max: 1_000_000 }), // amount
        (span, rawOffset, ledger, available, amount) => {
          const end = addDays(START, span);
          const d = addDays(START, rawOffset % (span + 1));
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
          };

          const rows = projectBalances(ledger, available, [entry], START, end);

          expect(rows).toHaveLength(span + 1);
          for (const row of rows) {
            const bump = row.date >= d ? amount : 0;
            expect(row.ledgerBalanceCents).toBe(ledger + bump);
            expect(row.availableBalanceCents).toBe(available + bump);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
