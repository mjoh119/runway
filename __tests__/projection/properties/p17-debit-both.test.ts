import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { projectBalances } from '@/lib/projection/engine';
import { addDays } from '@/lib/projection/dates';
import type { Entry } from '@/lib/projection/types';

const START = '2025-01-01';
const SPAN_DAYS = 60;
const END = addDays(START, SPAN_DAYS);

describe('Property 17: Debit decreases both balances', () => {
  /**
   * **Validates: Requirements 6.4**
   */
  it('a PLANNED DEBIT lowers ledger and available by its amount from its date onward, not before', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SPAN_DAYS }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }), // estimate (sign must not matter)
        fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null }), // actual
        fc.integer({ min: -5_000_000, max: 5_000_000 }), // starting ledger
        fc.integer({ min: -5_000_000, max: 5_000_000 }), // starting available
        (offset, estimate, actual, ledger0, available0) => {
          const d = addDays(START, offset);
          const entry: Entry = {
            id: 'debit-1',
            accountId: 'a1',
            scheduleId: null,
            postDate: d,
            shiftedPostDate: d,
            estimatedAmountCents: estimate,
            actualAmountCents: actual,
            status: 'PLANNED',
            entryType: 'DEBIT',
          };
          const amount = Math.abs(actual ?? estimate);

          const rows = projectBalances(ledger0, available0, [entry], START, END);
          expect(rows).toHaveLength(SPAN_DAYS + 1);

          for (const row of rows) {
            const expectedDelta = row.date >= d ? -amount : 0;
            expect(row.ledgerBalanceCents).toBe(ledger0 + expectedDelta);
            expect(row.availableBalanceCents).toBe(available0 + expectedDelta);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
