import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildWarnings } from '@/lib/projection/warnings';
import { addDays } from '@/lib/projection/dates';

// Feature: projection-engine-cycle-view, Property 32: Negative runway warning
// **Validates: Requirements 10.2**

const START = '2025-01-01';

describe('Property 32: Negative runway warning', () => {
  it('flags belowThreshold with the lowest balance and date for any negative lowest balance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: -1 }),
        fc.option(fc.integer({ min: -100_000_000, max: 100_000_000 }), { nil: undefined }),
        fc.boolean(),
        fc.integer({ min: 0, max: 60 }),
        (lowestBalanceCents, threshold, useNull, offset) => {
          const thresholdCents = useNull ? null : threshold;
          const lowestBalanceDate = addDays(START, offset);
          const warnings = buildWarnings({
            runway: {
              lowestBalanceCents,
              lowestBalanceDate,
              isBeforePayday: true,
              projectionEndDate: addDays(START, 60),
            },
            thresholdCents,
            entries: [],
            startDate: START,
            startingLedgerCents: 0,
            startingAvailableCents: 0,
          });

          expect(warnings.belowThreshold).toBeDefined();
          expect(warnings.belowThreshold!.lowestBalanceCents).toBe(lowestBalanceCents);
          expect(warnings.belowThreshold!.date).toBe(lowestBalanceDate);
        },
      ),
      { numRuns: 100 },
    );
  });
});
