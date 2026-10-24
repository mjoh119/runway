import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateEntries, shiftDate } from '../../../src/lib/projection/engine';
import { addDays } from '../../../src/lib/projection/dates';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';
import type { Schedule } from '../../../src/lib/projection/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const holidays = Array.from({ length: 12 }, (_, i) => 2019 + i).flatMap((y) =>
  generateFederalHolidays(y),
);

const startDateArb = fc
  .date({ min: new Date(Date.UTC(2020, 0, 1)), max: new Date(Date.UTC(2030, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

const scheduleArb: fc.Arbitrary<Schedule> = fc.oneof(
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
).chain((interval) =>
  fc.record({
    startDate: startDateArb,
    estimatedAmountCents: fc.integer({ min: 1, max: 1_000_000 }),
    entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
  }).map((rest) => ({
    id: 'sched-1',
    name: 'Test schedule',
    accountId: 'acct-1',
    ...interval,
    ...rest,
  })),
);

describe('Property 23: Both dates preserved', () => {
  /**
   * **Validates: Requirements 7.4**
   */
  it('keeps postDate and shiftedPostDate, with shiftedPostDate === shiftDate(postDate)', () => {
    fc.assert(
      fc.property(scheduleArb, fc.integer({ min: 0, max: 400 }), (schedule, span) => {
        const entries = generateEntries(
          schedule,
          schedule.startDate,
          addDays(schedule.startDate, span),
          holidays,
        );
        for (const e of entries) {
          expect(e.postDate).toMatch(DATE_RE);
          expect(e.shiftedPostDate).toMatch(DATE_RE);
          expect(e.shiftedPostDate).toBe(shiftDate(e.postDate, e.entryType, holidays));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('keeps both fields when the post date is already a business day', () => {
    // 2024-03-15 is a Friday and not a holiday.
    const schedule: Schedule = {
      id: 's',
      name: 'Rent',
      accountId: 'a',
      intervalType: 'WEEKS',
      intervalValue: 1,
      daysOfMonth: [],
      startDate: '2024-03-15',
      estimatedAmountCents: 100,
      entryType: 'DEBIT',
    };
    const [first] = generateEntries(schedule, '2024-03-15', '2024-03-15', holidays);
    expect(first.postDate).toBe('2024-03-15');
    expect(first.shiftedPostDate).toBe('2024-03-15');
  });

  it('keeps the original post date when shifting moves it', () => {
    // 2024-03-16 is a Saturday: debit -> Monday 03-18, income -> Friday 03-15.
    const base: Schedule = {
      id: 's',
      name: 'x',
      accountId: 'a',
      intervalType: 'DAYS',
      intervalValue: 1,
      daysOfMonth: [],
      startDate: '2024-03-16',
      estimatedAmountCents: 100,
      entryType: 'DEBIT',
    };
    const [debit] = generateEntries(base, '2024-03-16', '2024-03-16', holidays);
    const [income] = generateEntries({ ...base, entryType: 'INCOME' }, '2024-03-16', '2024-03-16', holidays);
    expect(debit.postDate).toBe('2024-03-16');
    expect(debit.shiftedPostDate).toBe('2024-03-18');
    expect(income.postDate).toBe('2024-03-16');
    expect(income.shiftedPostDate).toBe('2024-03-15');
  });
});
