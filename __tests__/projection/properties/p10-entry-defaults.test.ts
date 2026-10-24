import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateEntries } from '../../../src/lib/projection/engine';
import { addDays } from '../../../src/lib/projection/dates';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';
import type { Schedule } from '../../../src/lib/projection/types';

const holidays = Array.from({ length: 12 }, (_, i) => 2019 + i).flatMap((y) =>
  generateFederalHolidays(y),
);

const startDateArb = fc
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
      daysOfMonth: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { minLength: 1, maxLength: 6 }),
    }),
  )
  .chain((interval) =>
    fc
      .record({
        id: fc.stringMatching(/^[a-z0-9-]{1,12}$/),
        startDate: startDateArb,
        estimatedAmountCents: fc.integer({ min: -1_000_000, max: 1_000_000 }),
        entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
      })
      .map((rest) => ({
        name: 'Test schedule',
        accountId: 'acct-1',
        ...interval,
        ...rest,
      })),
  );

describe('Property 10: Generated entry defaults', () => {
  /**
   * **Validates: Requirements 4.5**
   */
  it('generated entries are PLANNED, have no actual, copy the schedule, and have unique ids', () => {
    fc.assert(
      fc.property(scheduleArb, fc.integer({ min: 0, max: 400 }), (schedule, span) => {
        const entries = generateEntries(
          schedule,
          schedule.startDate,
          addDays(schedule.startDate, span),
          holidays,
        );
        for (const e of entries) {
          expect(e.status).toBe('PLANNED');
          expect(e.actualAmountCents).toBeNull();
          expect(e.estimatedAmountCents).toBe(schedule.estimatedAmountCents);
          expect(Number.isInteger(e.estimatedAmountCents)).toBe(true);
          expect(e.scheduleId).toBe(schedule.id);
        }
        expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
      }),
      { numRuns: 100 },
    );
  });

  it('gives a weekly schedule distinct ids and defaults for each occurrence', () => {
    const schedule: Schedule = {
      id: 'rent',
      name: 'Rent',
      accountId: 'a',
      intervalType: 'WEEKS',
      intervalValue: 1,
      daysOfMonth: [],
      startDate: '2024-03-04',
      estimatedAmountCents: 150000,
      entryType: 'DEBIT',
    };
    const entries = generateEntries(schedule, '2024-03-04', '2024-03-25', holidays);
    expect(entries).toHaveLength(4);
    expect(new Set(entries.map((e) => e.id)).size).toBe(4);
    expect(entries.every((e) => e.status === 'PLANNED' && e.actualAmountCents === null)).toBe(true);
  });
});
