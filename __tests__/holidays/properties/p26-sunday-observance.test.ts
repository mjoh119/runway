import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyObservanceRules, generateFederalHolidays } from '../../../src/lib/holidays/generator';
import { addDays, dayOfWeek } from '../../../src/lib/projection/dates';

// Feature: projection-engine-cycle-view, Property 26: Sunday holiday observance
// **Validates: Requirements 8.3**

const FIXED_HOLIDAYS = [
  { name: 'New Year', month: 1, day: 1 },
  { name: 'Juneteenth', month: 6, day: 19 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Veterans Day', month: 11, day: 11 },
  { name: 'Christmas', month: 12, day: 25 },
];

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('Property 26: Sunday holiday observance', () => {
  it('a fixed-date holiday on Sunday is observed the following Monday', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1990, max: 2100 }),
        fc.constantFrom(...FIXED_HOLIDAYS),
        (year, h) => {
          const nominal = iso(year, h.month, h.day);
          const observed = applyObservanceRules(nominal);
          const holidays = generateFederalHolidays(year);

          if (dayOfWeek(nominal) === 0) {
            const monday = addDays(nominal, 1);
            expect(dayOfWeek(monday)).toBe(1);
            expect(observed).toBe(monday);
            expect(holidays).toContain(monday);
            expect(holidays).not.toContain(nominal);
          } else {
            expect(observed).toBe(nominal);
            expect(holidays).toContain(nominal);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
