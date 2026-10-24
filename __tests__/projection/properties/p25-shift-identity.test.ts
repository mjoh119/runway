import { describe, it } from 'vitest';
import fc from 'fast-check';
import { generateFederalHolidays } from '@/lib/holidays/generator';
import { addDays } from '@/lib/projection/dates';
import { isBusinessDay, shiftDate } from '@/lib/projection/shift';

// Feature: projection-engine-cycle-view, Property 25: Business day shift is identity
// **Validates: Requirements 7.7**

const START = '2020-01-01';
const SPAN_DAYS = 11 * 365; // through ~2030

const dateArb = fc.integer({ min: 0, max: SPAN_DAYS }).map((n) => addDays(START, n));
const directionArb = fc.constantFrom('DEBIT' as const, 'INCOME' as const);

function holidaysAround(date: string): string[] {
  const year = Number(date.slice(0, 4));
  return [year - 1, year, year + 1].flatMap(generateFederalHolidays);
}

describe('Property 25: Business day shift is identity', () => {
  it('shiftDate returns a business day unchanged in either direction', () => {
    fc.assert(
      fc.property(dateArb, directionArb, (date, direction) => {
        const holidays = holidaysAround(date);
        fc.pre(isBusinessDay(date, holidays));
        return shiftDate(date, direction, holidays) === date;
      }),
      { numRuns: 100 },
    );
  });
});
