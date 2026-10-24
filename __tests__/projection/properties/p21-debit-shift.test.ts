import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';
import { addDays } from '../../../src/lib/projection/dates';
import { isBusinessDay, shiftDate } from '../../../src/lib/projection/shift';

const pad = (n: number, w: number) => String(n).padStart(w, '0');

// Dates 2020-01-01 .. 2030-12-31 (day 1-28 keeps every month valid).
const dateArb = fc
  .record({
    y: fc.integer({ min: 2020, max: 2030 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ y, m, d }) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`);

function holidaysAround(date: string): string[] {
  const year = Number(date.slice(0, 4));
  return [year - 1, year, year + 1].flatMap(generateFederalHolidays);
}

describe('Property 21: Debit forward shifting', () => {
  /**
   * **Validates: Requirements 7.2**
   */
  it('shifts a non-business-day DEBIT to the first business day strictly after it', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const holidays = holidaysAround(date);
        fc.pre(!isBusinessDay(date, holidays));

        const shifted = shiftDate(date, 'DEBIT', holidays);

        expect(shifted > date).toBe(true);
        expect(isBusinessDay(shifted, holidays)).toBe(true);
        for (let d = addDays(date, 1); d < shifted; d = addDays(d, 1)) {
          expect(isBusinessDay(d, holidays)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
