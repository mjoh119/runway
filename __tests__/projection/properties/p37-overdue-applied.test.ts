import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { projectBalances } from '@/lib/projection/engine';
import { addDays } from '@/lib/projection/dates';
import type { Entry } from '@/lib/projection/types';

const START = '2025-06-15';
const SPAN_DAYS = 30;
const END = addDays(START, SPAN_DAYS);

// Feature: projection-engine-cycle-view, Property 37: Overdue entry application
describe('Property 37: Overdue entry application', () => {
  /**
   * **Validates: Requirements 12.1**
   */
  it('an overdue PLANNED entry projects identically to the same entry placed on the start date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }), // days before start
        fc.constantFrom<'DEBIT' | 'INCOME'>('DEBIT', 'INCOME'),
        fc.integer({ min: 1, max: 1_000_000 }), // estimate
        fc.integer({ min: -5_000_000, max: 5_000_000 }), // starting ledger
        fc.integer({ min: -5_000_000, max: 5_000_000 }), // starting available
        (daysBefore, entryType, estimate, ledger0, available0) => {
          const past = addDays(START, -daysBefore);
          const base: Entry = {
            id: 'e1',
            accountId: 'a1',
            scheduleId: null,
            postDate: past,
            shiftedPostDate: past,
            estimatedAmountCents: estimate,
            actualAmountCents: null,
            status: 'PLANNED',
            entryType,
          };
          const overdue = projectBalances(ledger0, available0, [base], START, END);

          const atStart: Entry = { ...base, postDate: START, shiftedPostDate: START };
          const reference = projectBalances(ledger0, available0, [atStart], START, END);

          expect(overdue).toEqual(reference);

          const sign = entryType === 'DEBIT' ? -1 : 1;
          for (const row of overdue) {
            expect(row.ledgerBalanceCents).toBe(ledger0 + sign * estimate);
            expect(row.availableBalanceCents).toBe(available0 + sign * estimate);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
