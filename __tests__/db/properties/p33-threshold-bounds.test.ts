import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MAX_LOW_BALANCE_THRESHOLD_CENTS,
  validateLowBalanceThresholdCents,
  validateWorkspaceSettings,
} from '@/lib/workspace-settings';

// Feature: projection-engine-cycle-view, Property 33: Threshold storage bounds
// **Validates: Requirements 10.3**

describe('Property 33: Threshold storage bounds', () => {
  it('accepts every integer in 0..999,999,999', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_LOW_BALANCE_THRESHOLD_CENTS }), (v) => {
        expect(validateLowBalanceThresholdCents(v)).toBe(v);
        const s = validateWorkspaceSettings({
          lowBalanceThresholdCents: v,
          projectionHorizonDays: 30,
        });
        expect(s.lowBalanceThresholdCents).toBe(v);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects negative integers with RangeError', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_000_000_000, max: -1 }), (v) => {
        expect(() => validateLowBalanceThresholdCents(v)).toThrow(RangeError);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects integers above the maximum with RangeError', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_LOW_BALANCE_THRESHOLD_CENTS + 1, max: Number.MAX_SAFE_INTEGER }),
        (v) => {
          expect(() => validateLowBalanceThresholdCents(v)).toThrow(RangeError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects non-integers with RangeError', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }).filter((d) => !Number.isInteger(d)),
        (v) => {
          expect(() => validateLowBalanceThresholdCents(v)).toThrow(RangeError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects NaN and infinities with RangeError', () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(() => validateLowBalanceThresholdCents(v)).toThrow(RangeError);
    }
  });

  it('allows a null or undefined threshold in validateWorkspaceSettings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        fc.integer({ min: 1, max: 365 }),
        (t, days) => {
          const s = validateWorkspaceSettings({
            lowBalanceThresholdCents: t,
            projectionHorizonDays: days,
          });
          expect(s.lowBalanceThresholdCents).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
