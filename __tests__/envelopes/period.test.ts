import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { periodContaining, precedingPeriod } from '../../src/lib/envelopes/period';

const DAY_MS = 86_400_000;

/** Independent date helpers (UTC) so the test does not reuse the code under test. */
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const weekday = (date: string) => new Date(utcMs(date)).getUTCDay(); // 0 = Sunday

// Dates from 1990-01-01 to 2100-12-31, including leap days and year boundaries.
const anyDate = fc
  .integer({ min: utcMs('1990-01-01') / DAY_MS, max: utcMs('2100-12-31') / DAY_MS })
  .map((days) => toIso(days * DAY_MS));

const incomeDates = fc.array(anyDate, { maxLength: 6 });

describe('periodContaining WEEKLY', () => {
  it('Property 15: weekly periods run Monday to Sunday', () => {
    // **Validates: Requirements 7.7**
    fc.assert(
      fc.property(anyDate, incomeDates, anyDate, (date, income, fallback) => {
        const { start, end } = periodContaining('WEEKLY', date, income, fallback);

        expect(start <= date && date <= end).toBe(true);
        expect(weekday(start)).toBe(1); // Monday
        expect(weekday(end)).toBe(0); // Sunday
        expect((utcMs(end) - utcMs(start)) / DAY_MS).toBe(6); // 7 days inclusive
      }),
      { numRuns: 200 },
    );
  });

  it('maps a Sunday to the week that ended on it, and a Monday to the week it starts', () => {
    expect(periodContaining('WEEKLY', '2026-03-15', [], '2026-03-01')).toEqual({
      start: '2026-03-09',
      end: '2026-03-15',
    });
    expect(periodContaining('WEEKLY', '2026-03-16', [], '2026-03-01')).toEqual({
      start: '2026-03-16',
      end: '2026-03-22',
    });
  });

  it('crosses month and year boundaries', () => {
    // 2025-12-31 is a Wednesday.
    expect(periodContaining('WEEKLY', '2025-12-31', [], '2025-12-01')).toEqual({
      start: '2025-12-29',
      end: '2026-01-04',
    });
  });
});

describe('periodContaining MONTHLY', () => {
  it('Property 16: monthly periods cover the calendar month', () => {
    // **Validates: Requirements 7.8**
    fc.assert(
      fc.property(anyDate, incomeDates, anyDate, (date, income, fallback) => {
        const { start, end } = periodContaining('MONTHLY', date, income, fallback);

        expect(start <= date && date <= end).toBe(true);
        expect(start.slice(0, 7)).toBe(date.slice(0, 7));
        expect(end.slice(0, 7)).toBe(date.slice(0, 7));
        expect(start.slice(8, 10)).toBe('01');
        // The day after the end is day 1 of the next month.
        expect(toIso(utcMs(end) + DAY_MS).slice(8, 10)).toBe('01');
      }),
      { numRuns: 200 },
    );
  });

  it('ends a leap-year February on the 29th', () => {
    for (const date of ['2024-02-01', '2024-02-29', '2000-02-15']) {
      const { start, end } = periodContaining('MONTHLY', date, [], '2024-01-01');
      expect(start).toBe(`${date.slice(0, 7)}-01`);
      expect(end).toBe(`${date.slice(0, 7)}-29`);
    }
  });

  it('ends a non-leap February on the 28th, including century years', () => {
    for (const date of ['2025-02-10', '2100-02-28', '1900-02-01']) {
      const { end } = periodContaining('MONTHLY', date, [], '2025-01-01');
      expect(end).toBe(`${date.slice(0, 7)}-28`);
    }
  });

  it('handles December without rolling into the next year', () => {
    expect(periodContaining('MONTHLY', '2025-12-31', [], '2025-12-01')).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });
});

describe('periodContaining and precedingPeriod EACH_PAY_CYCLE', () => {
  const addDaysIso = (date: string, n: number) => toIso(utcMs(date) + n * DAY_MS);
  const sortedIncome = fc.uniqueArray(anyDate, { maxLength: 8 }).map((a) => [...a].sort());

  it('Property 17: pay-cycle periods use only scheduled income (period part)', () => {
    // **Validates: Requirements 7.9, 7.10**
    fc.assert(
      fc.property(anyDate, sortedIncome, fc.integer({ min: -30, max: 29 }), (date, income, back) => {
        // The fallback is the Current_Date, so it lies within 30 days of the queried date.
        const fallback = addDaysIso(date, -back);
        const { start, end } = periodContaining('EACH_PAY_CYCLE', date, income, fallback);
        const before = income.filter((d) => d <= date);
        const after = income.filter((d) => d > date);

        expect(start <= date).toBe(true);
        // With no later income the period is open-ended for 30 days from its start,
        // so containment holds whenever the date falls inside that window.
        if (after.length > 0 || date <= addDaysIso(start, 29)) expect(date <= end).toBe(true);
        if (before.length > 0) {
          expect(start).toBe(before[before.length - 1]);
        } else {
          expect(start).toBe(fallback < date ? fallback : date);
        }
        if (after.length > 0) {
          expect(end).toBe(addDaysIso(after[0], -1));
        } else {
          expect(end).toBe(addDaysIso(start, 29)); // 30-day open end
        }

        // Order and duplicates in the input do not matter.
        const shuffled = [...income, ...income].reverse();
        expect(periodContaining('EACH_PAY_CYCLE', date, shuffled, fallback)).toEqual({ start, end });

        // Preceding period: latest income before current.start, or null.
        const prev = precedingPeriod('EACH_PAY_CYCLE', { start, end }, income);
        const earlier = income.filter((d) => d < start);
        if (earlier.length === 0) {
          expect(prev).toBeNull();
        } else {
          expect(prev).toEqual({ start: earlier[earlier.length - 1], end: addDaysIso(start, -1) });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('starts at the fallback and runs 30 days when there is no income', () => {
    expect(periodContaining('EACH_PAY_CYCLE', '2026-03-10', [], '2026-03-05')).toEqual({
      start: '2026-03-05',
      end: '2026-04-03',
    });
  });

  it('ends the day before the next income and has a null preceding period at the start', () => {
    const income = ['2026-03-13', '2026-03-27'];
    const current = periodContaining('EACH_PAY_CYCLE', '2026-03-15', income, '2026-03-15');
    expect(current).toEqual({ start: '2026-03-13', end: '2026-03-26' });
    expect(precedingPeriod('EACH_PAY_CYCLE', current, income)).toBeNull();
    expect(precedingPeriod('EACH_PAY_CYCLE', { start: '2026-03-27', end: '2026-04-25' }, income)).toEqual({
      start: '2026-03-13',
      end: '2026-03-26',
    });
  });
});

