import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { clampDayOfMonth, generateEntries } from '../../../src/lib/projection/engine';
import type { Schedule } from '../../../src/lib/projection/types';

const pad = (n: number, w: number) => String(n).padStart(w, '0');

// Independent month-length calculation (Gregorian leap rule), month is 0-indexed.
function monthLength(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

describe('Property 9: Month-end clamping', () => {
  /**
   * **Validates: Requirements 4.4**
   */
  it('clampDayOfMonth equals min(day, days in month) for days 29-31', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2400 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 29, max: 31 }),
        (year, month, day) => {
          const clamped = clampDayOfMonth(year, month, day);
          expect(clamped).toBe(Math.min(day, monthLength(year, month)));
          expect(clamped).toBeLessThanOrEqual(monthLength(year, month));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.4**
   */
  it('DAYS_OF_MONTH schedules with days 29-31 post on the clamped, valid day each month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 24 }),
        fc.uniqueArray(fc.integer({ min: 29, max: 31 }), { minLength: 1, maxLength: 3 }),
        fc.constantFrom<'INCOME' | 'DEBIT'>('INCOME', 'DEBIT'),
        (startYear, startMonth, monthCount, daysOfMonth, entryType) => {
          const startDate = `${pad(startYear, 4)}-${pad(startMonth + 1, 2)}-01`;
          const lastIdx = startYear * 12 + startMonth + monthCount - 1;
          const endYear = Math.floor(lastIdx / 12);
          const endMonth = lastIdx % 12;
          const endDate = `${pad(endYear, 4)}-${pad(endMonth + 1, 2)}-${pad(monthLength(endYear, endMonth), 2)}`;

          const schedule: Schedule = {
            id: 'sched',
            name: 'Month-end',
            accountId: 'acct',
            intervalType: 'DAYS_OF_MONTH',
            intervalValue: 1,
            daysOfMonth,
            startDate,
            estimatedAmountCents: 10_000,
            entryType,
          };

          const actual = generateEntries(schedule, startDate, endDate, []).map((e) => e.postDate);

          // Expected: per month, each chosen day clamped, de-duplicated, ascending.
          const expected: string[] = [];
          for (let idx = startYear * 12 + startMonth; idx <= lastIdx; idx++) {
            const y = Math.floor(idx / 12);
            const m = idx % 12;
            const len = monthLength(y, m);
            const days = [...new Set(daysOfMonth.map((d) => Math.min(d, len)))].sort((a, b) => a - b);
            for (const d of days) expected.push(`${pad(y, 4)}-${pad(m + 1, 2)}-${pad(d, 2)}`);
          }

          expect(actual).toEqual(expected);
          for (const date of actual) {
            const y = Number(date.slice(0, 4));
            const m = Number(date.slice(5, 7)) - 1;
            const d = Number(date.slice(8, 10));
            expect(d).toBeGreaterThanOrEqual(1);
            expect(d).toBeLessThanOrEqual(monthLength(y, m));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
