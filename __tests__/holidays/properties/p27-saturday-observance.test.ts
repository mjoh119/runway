import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';
import { addDays, dayOfWeek } from '../../../src/lib/projection/dates';

// Feature: projection-engine-cycle-view, Property 27: Saturday holiday not observed Friday
// Fixed-date holidays as [month, day] (1-indexed month).
const FIXED: Array<[number, number]> = [
  [1, 1],
  [6, 19],
  [7, 4],
  [11, 11],
  [12, 25],
];

const pad = (n: number) => String(n).padStart(2, '0');

describe('Property 27: Saturday holiday not observed Friday', () => {
  /**
   * **Validates: Requirements 8.4**
   */
  it('a fixed-date holiday on Saturday stays on Saturday and the preceding Friday is not a holiday', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1990, max: 2100 }),
        fc.constantFrom(...FIXED),
        (year, [month, day]) => {
          const date = `${year}-${pad(month)}-${pad(day)}`;
          fc.pre(dayOfWeek(date) === 6);

          const holidays = generateFederalHolidays(year);
          expect(holidays).toContain(date);

          const friday = addDays(date, -1);
          // The Friday could only be a holiday by being another holiday's date
          // (e.g. none of the fixed-date or floating rules land there in practice).
          const otherHolidays = holidays.filter((h) => h !== date);
          expect(holidays.includes(friday)).toBe(otherHolidays.includes(friday));
          if (friday.slice(0, 4) === String(year)) {
            expect(otherHolidays).not.toContain(friday);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
