import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { buildWarnings } from '@/lib/projection/warnings';
import type { RunwayResult } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 31: Threshold warning display
// **Validates: Requirements 10.1**

const START = '2025-01-01';

// Threshold and lowest balance, with lowest strictly below threshold.
// Thresholds up to 1,000,000 so non-negative runways below threshold are covered.
const caseArb = fc
  .tuple(
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.integer({ min: 1, max: 2_000_000 }),
    fc.integer({ min: 0, max: 60 }),
  )
  .map(([threshold, gap, offset]) => {
    const runway: RunwayResult = {
      lowestBalanceCents: threshold - gap,
      lowestBalanceDate: addDays(START, offset),
      isBeforePayday: true,
      projectionEndDate: addDays(START, 60),
    };
    return { threshold, runway };
  });

describe('Property 31: Threshold warning display', () => {
  it('returns belowThreshold with threshold, lowest balance and date when runway < threshold', () => {
    fc.assert(
      fc.property(caseArb, ({ threshold, runway }) => {
        const w = buildWarnings({
          runway,
          thresholdCents: threshold,
          entries: [],
          startDate: START,
          startingLedgerCents: 0,
          startingAvailableCents: 0,
        });
        expect(w.belowThreshold).toEqual({
          thresholdCents: threshold,
          lowestBalanceCents: runway.lowestBalanceCents,
          date: runway.lowestBalanceDate,
        });
      }),
      { numRuns: 100 },
    );
  });
});
