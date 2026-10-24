import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateEntries } from '../../../src/lib/projection/engine';
import { addDays } from '../../../src/lib/projection/dates';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';
import type { Schedule } from '../../../src/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 8: Entry generation within bounds

const holidays = Array.from({ length: 13 }, (_, i) => 2019 + i).flatMap((y) =>
  generateFederalHolidays(y),
);

const dateArb = fc
  .date({ min: new Date(Date.UTC(2020, 0, 1)), max: new Date(Date.UTC(2030, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

const scheduleArb: fc.Arbitrary<Schedule> = fc
  .oneof(
    fc.record({
      intervalType: fc.constant('DAYS' as const),
      intervalValue: fc.integer({ min: 1, max: 60 }),
      daysOfMonth: fc.constant<number[]>([]),
    }),
    fc.record({
      intervalType: fc.constant('WEEKS' as const),
      intervalValue: fc.integer({ min: 1, max: 12 }),
      daysOfMonth: fc.constant<number[]>([]),
    }),
    fc.record({
      intervalType: fc.constant('MONTHS' as const),
      intervalValue: fc.integer({ min: 1, max: 12 }),
      daysOfMonth: fc.constant<number[]>([]),
    }),
    fc.record({
      intervalType: fc.constant('DAYS_OF_MONTH' as const),
      intervalValue: fc.constant(1),
      daysOfMonth: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { minLength: 1, maxLength: 4 }),
    }),
  )
  .chain((interval) =>
    fc
      .record({
        startDate: dateArb,
        estimatedAmountCents: fc.integer({ min: 1, max: 1_000_000 }),
        entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
      })
      .map((rest) => ({
        id: 'sched-1',
        name: 'Test schedule',
        accountId: 'acct-1',
        ...interval,
        ...rest,
      })),
  );

describe('Property 8: Entry generation within bounds', () => {
  /**
   * **Validates: Requirements 4.2**
   */
  it('every entry postDate is within [max(window start, schedule.startDate), end] and ascending', () => {
    fc.assert(
      fc.property(
        scheduleArb,
        // Window start may fall before, on, or after the schedule start.
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: 0, max: 500 }),
        (schedule, startOffset, span) => {
          const windowStart = addDays(schedule.startDate, startOffset);
          const windowEnd = addDays(windowStart, span);
          const lower = windowStart > schedule.startDate ? windowStart : schedule.startDate;

          const entries = generateEntries(schedule, windowStart, windowEnd, holidays);

          for (const e of entries) {
            expect(e.postDate >= lower).toBe(true);
            expect(e.postDate <= windowEnd).toBe(true);
          }
          for (let i = 1; i < entries.length; i++) {
            expect(entries[i].postDate >= entries[i - 1].postDate).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
