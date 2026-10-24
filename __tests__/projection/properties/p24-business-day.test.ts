import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { isBusinessDay } from '../../../src/lib/projection/shift';
import { generateFederalHolidays } from '../../../src/lib/holidays/generator';

// Feature: projection-engine-cycle-view, Property 24: Business day definition

const START_MS = Date.UTC(2020, 0, 1);
const END_MS = Date.UTC(2030, 11, 31);
const DAY_MS = 86_400_000;
const TOTAL_DAYS = Math.round((END_MS - START_MS) / DAY_MS);

const toIso = (offset: number): string =>
  new Date(START_MS + offset * DAY_MS).toISOString().slice(0, 10);

const dateArb = fc.integer({ min: 0, max: TOTAL_DAYS }).map(toIso);

/** Holiday list built from the date's year and its neighbours, plus random extra dates. */
const caseArb = fc
  .record({
    date: dateArb,
    extras: fc.array(dateArb, { maxLength: 5 }),
    includeSelf: fc.boolean(),
  })
  .map(({ date, extras, includeSelf }) => {
    const year = Number(date.slice(0, 4));
    const holidays = [year - 1, year, year + 1].flatMap(generateFederalHolidays);
    holidays.push(...extras);
    if (includeSelf) holidays.push(date);
    return { date, holidays };
  });

describe('Property 24: Business day definition', () => {
  /**
   * **Validates: Requirements 7.6**
   */
  it('is a business day iff not Saturday, not Sunday, and not in the holiday list', () => {
    fc.assert(
      fc.property(caseArb, ({ date, holidays }) => {
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const expected = dow !== 0 && dow !== 6 && !holidays.includes(date);
        expect(isBusinessDay(date, holidays)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
