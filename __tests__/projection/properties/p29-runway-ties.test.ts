import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { computeRunway } from '@/lib/projection/runway';
import type { ProjectedBalance } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 29: Runway tie-breaking
// **Validates: Requirements 9.3**

const START = '2025-01-01';

// Small value range forces repeated lowest values; one row per consecutive day.
const seriesArb = fc
  .array(fc.integer({ min: -3, max: 3 }), { minLength: 2, maxLength: 40 })
  .map((vals): ProjectedBalance[] =>
    vals.map((v, i) => ({
      date: addDays(START, i),
      ledgerBalanceCents: v * 100,
      availableBalanceCents: v * 100,
      isEstimated: false,
    })),
  );

describe('Property 29: Runway tie-breaking', () => {
  it('returns the earliest date having the lowest value, regardless of row order', () => {
    fc.assert(
      fc.property(
        seriesArb,
        fc.boolean(),
        fc.infiniteStream(fc.nat()),
        (series, useIncomeBound, randoms) => {
          const last = series[series.length - 1].date;
          // Income bound excludes the final day (strictly before payday).
          const nextIncome = useIncomeBound ? last : null;
          const windowed = series.filter((b) =>
            nextIncome !== null ? b.date < nextIncome : b.date <= last,
          );

          const min = Math.min(...windowed.map((b) => b.availableBalanceCents));
          const expectedDate = windowed.find((b) => b.availableBalanceCents === min)!.date;

          // Deterministic shuffle driven by fast-check's stream (Fisher-Yates).
          const it = randoms[Symbol.iterator]();
          const shuffled = [...series];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = it.next().value % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          for (const rows of [series, shuffled]) {
            const result = computeRunway(rows, nextIncome, last);
            expect(result).not.toBeNull();
            expect(result!.lowestBalanceCents).toBe(min);
            expect(result!.lowestBalanceDate).toBe(expectedDate);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
