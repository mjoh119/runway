import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { computeRunway } from '@/lib/projection/runway';
import type { ProjectedBalance } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 30: Runway within horizon
// **Validates: Requirements 9.4**

const START = '2025-01-01';

const balancesArb = fc
  .tuple(
    fc.integer({ min: 0, max: 60 }), // horizon length in days
    fc.array(
      fc.record({
        offset: fc.integer({ min: 0, max: 90 }), // may exceed horizon
        available: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      }),
      { minLength: 1, maxLength: 40 },
    ),
  )
  .map(([horizon, rows]) => {
    const balances: ProjectedBalance[] = rows
      .map((r) => ({
        date: addDays(START, r.offset),
        ledgerBalanceCents: r.available,
        availableBalanceCents: r.available,
        isEstimated: false,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { balances, end: addDays(START, horizon) };
  });

describe('Property 30: Runway within horizon', () => {
  it('with no next income, takes the minimum through projectionEndDate inclusive, earliest on ties', () => {
    fc.assert(
      fc.property(balancesArb, ({ balances, end }) => {
        const result = computeRunway(balances, null, end);
        const inWindow = balances.filter((b) => b.date <= end);

        if (inWindow.length === 0) {
          expect(result).toBeNull();
          return;
        }

        const min = Math.min(...inWindow.map((b) => b.availableBalanceCents));
        const earliest = inWindow
          .filter((b) => b.availableBalanceCents === min)
          .map((b) => b.date)
          .sort()[0];

        expect(result).not.toBeNull();
        expect(result!.lowestBalanceCents).toBe(min);
        expect(result!.lowestBalanceDate).toBe(earliest);
        expect(result!.isBeforePayday).toBe(false);
        expect(result!.projectionEndDate).toBe(end);
      }),
      { numRuns: 100 },
    );
  });
});
