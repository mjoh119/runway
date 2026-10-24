import { describe, it } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { computeRunway } from '@/lib/projection/runway';
import type { ProjectedBalance } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 28: Runway before income
// **Validates: Requirements 9.1, 9.2**

const START = '2025-01-01';

const scenarioArb = fc
  .record({
    available: fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
      minLength: 2,
      maxLength: 60,
    }),
    ledgerOffset: fc.integer({ min: -50_000, max: 50_000 }),
  })
  .chain(({ available, ledgerOffset }) =>
    // Income index is within the series and after the first row, so the window is nonempty.
    fc.integer({ min: 1, max: available.length - 1 }).map((incomeIdx) => {
      const balances: ProjectedBalance[] = available.map((a, i) => ({
        date: addDays(START, i),
        ledgerBalanceCents: a + ledgerOffset,
        availableBalanceCents: a,
        isEstimated: false,
      }));
      return { balances, incomeDate: addDays(START, incomeIdx) };
    }),
  );

describe('Property 28: Runway before income', () => {
  it('lowest balance is the minimum among rows strictly before the income date', () => {
    fc.assert(
      fc.property(scenarioArb, ({ balances, incomeDate }) => {
        const endDate = balances[balances.length - 1].date;
        const result = computeRunway(balances, incomeDate, endDate);
        if (result === null) return false;

        const before = balances.filter((b) => b.date < incomeDate);
        const min = Math.min(...before.map((b) => b.availableBalanceCents));
        const matchingDates = before
          .filter((b) => b.availableBalanceCents === min)
          .map((b) => b.date);

        return (
          result.lowestBalanceCents === min &&
          matchingDates.includes(result.lowestBalanceDate) &&
          result.isBeforePayday === true
        );
      }),
      { numRuns: 100 },
    );
  });
});
