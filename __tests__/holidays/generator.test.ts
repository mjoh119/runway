import { describe, it, expect } from 'vitest';
import { applyObservanceRules, generateFederalHolidays } from '../../src/lib/holidays/generator';
import { calendarYearsTouched } from '../../src/lib/holidays/years';

describe('applyObservanceRules', () => {
  it('moves a Sunday holiday to Monday (2027-07-04 -> 2027-07-05)', () => {
    expect(applyObservanceRules('2027-07-04')).toBe('2027-07-05');
  });

  it('keeps a Saturday holiday on Saturday (2026-07-04)', () => {
    expect(applyObservanceRules('2026-07-04')).toBe('2026-07-04');
  });
});

describe('generateFederalHolidays', () => {
  it.each([2024, 2025, 2026, 2027, 2028, 2030])('returns exactly 11 dates for %i', (year) => {
    const dates = generateFederalHolidays(year);
    expect(dates).toHaveLength(11);
    expect(new Set(dates).size).toBe(11);
  });

  it('applies observance to Independence Day', () => {
    expect(generateFederalHolidays(2027)).toContain('2027-07-05');
    expect(generateFederalHolidays(2026)).toContain('2026-07-04');
  });
});

describe('calendarYearsTouched', () => {
  it('spans a year boundary', () => {
    expect(calendarYearsTouched('2025-12-20', '2026-01-10')).toEqual([2025, 2026]);
  });

  it('spans multiple years', () => {
    expect(calendarYearsTouched('2024-06-01', '2027-02-01')).toEqual([2024, 2025, 2026, 2027]);
  });

  it('returns a single year', () => {
    expect(calendarYearsTouched('2026-03-01', '2026-09-01')).toEqual([2026]);
  });
});
