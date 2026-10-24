import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateFederalHolidays } from '@/lib/holidays/generator';
import { isBusinessDay, shiftDate } from '@/lib/projection/shift';
import { addDays } from '@/lib/projection/dates';

const pad = (n: number) => String(n).padStart(2, '0');

// Dates 2020-01-01 .. 2030-12-31, built from a day offset to guarantee validity.
const dateArb = fc
  .integer({ min: 0, max: Date.UTC(2030, 11, 31) / 86400000 - Date.UTC(2020, 0, 1) / 86400000 })
  .map((offset) => {
    const d = new Date(Date.UTC(2020, 0, 1) + offset * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });

function holidaysAround(date: string): string[] {
  const year = Number(date.slice(0, 4));
  return [year - 1, year, year + 1].flatMap(generateFederalHolidays);
}

describe('Property 22: Income backward shifting', () => {
  /**
   * **Validates: Requirements 7.3**
   */
  it('shifts a non-business-day INCOME to the first business day strictly before it', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const holidays = holidaysAround(date);
        fc.pre(!isBusinessDay(date, holidays));

        const shifted = shiftDate(date, 'INCOME', holidays);

        expect(shifted < date).toBe(true);
        expect(isBusinessDay(shifted, holidays)).toBe(true);
        for (let d = addDays(shifted, 1); d < date; d = addDays(d, 1)) {
          expect(isBusinessDay(d, holidays)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
