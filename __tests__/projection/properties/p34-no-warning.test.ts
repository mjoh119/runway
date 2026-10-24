import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildWarnings } from '@/lib/projection/warnings';
import type { RunwayResult } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 34: No warning without trigger
// **Validates: Requirements 10.4**

const runwayArb = (minCents: number, maxCents: number) =>
  fc.integer({ min: minCents, max: maxCents }).map(
    (lowestBalanceCents): RunwayResult => ({
      lowestBalanceCents,
      lowestBalanceDate: '2025-01-10',
      isBeforePayday: true,
      projectionEndDate: '2025-01-15',
    }),
  );

const run = (runway: RunwayResult, thresholdCents: number | null | undefined) =>
  buildWarnings({
    runway,
    thresholdCents,
    entries: [],
    startDate: '2025-01-01',
    startingLedgerCents: 0,
    startingAvailableCents: 0,
  });

describe('Property 34: No warning without trigger', () => {
  it('omits belowThreshold when no threshold is set and runway is non-negative', () => {
    fc.assert(
      fc.property(
        runwayArb(0, 10_000_000),
        fc.constantFrom<null | undefined>(null, undefined),
        (runway, threshold) => {
          expect(run(runway, threshold).belowThreshold).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('omits belowThreshold when runway >= threshold and runway is non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (threshold, extra) => {
          const runway: RunwayResult = {
            lowestBalanceCents: threshold + extra,
            lowestBalanceDate: '2025-01-10',
            isBeforePayday: false,
            projectionEndDate: '2025-01-31',
          };
          expect(run(runway, threshold).belowThreshold).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
