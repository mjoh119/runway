import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateEntries, validateSchedule } from '../../../src/lib/projection/engine';
import type { Schedule } from '../../../src/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 11: Invalid interval rejection

const MAX = { DAYS: 365, WEEKS: 52, MONTHS: 12 } as const;
type Unit = keyof typeof MAX;

const unitArb = fc.constantFrom<Unit>('DAYS', 'WEEKS', 'MONTHS');

function makeSchedule(overrides: Partial<Schedule>): Schedule {
  return {
    id: 'sched-1',
    name: 'Test schedule',
    accountId: 'acct-1',
    intervalType: 'DAYS',
    intervalValue: 1,
    daysOfMonth: [],
    startDate: '2025-01-01',
    estimatedAmountCents: 1000,
    entryType: 'DEBIT',
    ...overrides,
  } as Schedule;
}

const invalidValueArb = (unit: Unit): fc.Arbitrary<number> =>
  fc.oneof(
    fc.constant(0),
    fc.integer({ min: -1_000_000, max: -1 }),
    fc.integer({ min: MAX[unit] + 1, max: 1_000_000 }),
    fc.double({ min: -1000, max: 1000, noNaN: true }).filter((n) => !Number.isInteger(n)),
    fc.constantFrom(NaN, Infinity, -Infinity),
  );

const invalidDaysArb: fc.Arbitrary<number[]> = fc.oneof(
  fc.constant<number[]>([]),
  fc
    .tuple(
      fc.array(fc.integer({ min: 1, max: 31 }), { maxLength: 3 }),
      fc.oneof(
        fc.integer({ min: -1000, max: 0 }),
        fc.integer({ min: 32, max: 1000 }),
        fc.double({ min: 1, max: 31, noNaN: true }).filter((n) => !Number.isInteger(n)),
      ),
    )
    .map(([valid, bad]) => [...valid, bad]),
);

describe('Property 11: Invalid interval rejection', () => {
  /**
   * **Validates: Requirements 4.6**
   */
  it('rejects zero, negative, non-integer and above-max N with a descriptive error', () => {
    fc.assert(
      fc.property(
        unitArb.chain((unit) => fc.tuple(fc.constant(unit), invalidValueArb(unit))),
        ([unit, value]) => {
          const schedule = makeSchedule({ intervalType: unit, intervalValue: value });
          expect(() => validateSchedule(schedule)).toThrow(/Invalid interval value/);
          expect(() => generateEntries(schedule, '2025-01-01', '2026-01-01', [])).toThrow(
            /Invalid interval value/,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects empty or out-of-range daysOfMonth with a descriptive error', () => {
    fc.assert(
      fc.property(invalidDaysArb, (days) => {
        const schedule = makeSchedule({ intervalType: 'DAYS_OF_MONTH', daysOfMonth: days });
        expect(() => validateSchedule(schedule)).toThrow(/Invalid interval value/);
        expect(() => generateEntries(schedule, '2025-01-01', '2026-01-01', [])).toThrow(
          /Invalid interval value/,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('accepts valid in-bound values without throwing', () => {
    fc.assert(
      fc.property(
        unitArb.chain((unit) => fc.tuple(fc.constant(unit), fc.integer({ min: 1, max: MAX[unit] }))),
        fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { minLength: 1, maxLength: 5 }),
        ([unit, value], days) => {
          const interval = makeSchedule({ intervalType: unit, intervalValue: value });
          expect(() => validateSchedule(interval)).not.toThrow();
          expect(() => generateEntries(interval, '2025-01-01', '2025-03-01', [])).not.toThrow();

          const dom = makeSchedule({ intervalType: 'DAYS_OF_MONTH', daysOfMonth: days });
          expect(() => validateSchedule(dom)).not.toThrow();
          expect(() => generateEntries(dom, '2025-01-01', '2025-03-01', [])).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
