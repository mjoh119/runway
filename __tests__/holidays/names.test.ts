import { describe, expect, it } from 'vitest';
import { federalHolidayName, shiftReason } from '../../src/lib/holidays/names';
import { generateFederalHolidays } from '../../src/lib/holidays/generator';

describe('federalHolidayName', () => {
  it('names each 2026 holiday', () => {
    expect(federalHolidayName('2026-01-01')).toBe("New Year's Day");
    expect(federalHolidayName('2026-01-19')).toBe('MLK Day');
    expect(federalHolidayName('2026-02-16')).toBe('Presidents Day');
    expect(federalHolidayName('2026-05-25')).toBe('Memorial Day');
    expect(federalHolidayName('2026-06-19')).toBe('Juneteenth');
    expect(federalHolidayName('2026-07-04')).toBe('Independence Day');
    expect(federalHolidayName('2026-09-07')).toBe('Labor Day');
    expect(federalHolidayName('2026-10-12')).toBe('Columbus Day');
    expect(federalHolidayName('2026-11-11')).toBe('Veterans Day');
    expect(federalHolidayName('2026-11-26')).toBe('Thanksgiving');
    expect(federalHolidayName('2026-12-25')).toBe('Christmas Day');
  });

  it('maps Sunday holidays to their observed Monday', () => {
    // Nov 11, 2029 is a Sunday; observed Monday Nov 12.
    expect(federalHolidayName('2029-11-12')).toBe('Veterans Day');
    expect(federalHolidayName('2029-11-11')).toBeNull();
  });

  it('returns null for ordinary days', () => {
    expect(federalHolidayName('2026-03-11')).toBeNull();
  });

  it('agrees with generateFederalHolidays', () => {
    for (const d of generateFederalHolidays(2027)) expect(federalHolidayName(d)).not.toBeNull();
  });
});

describe('shiftReason', () => {
  it('uses the weekend when the original date is a weekend', () => {
    expect(shiftReason('2026-10-24')).toBe('moved from Sat Oct 24');
    expect(shiftReason('2026-10-25')).toBe('moved from Sun Oct 25');
  });

  it('names the holiday for weekday holidays', () => {
    expect(shiftReason('2026-01-19')).toBe('moved from Mon Jan 19, MLK Day');
  });

  it('falls back to "bank holiday" when the date is not a known holiday', () => {
    expect(shiftReason('2026-03-11')).toBe('moved from Wed Mar 11, bank holiday');
  });
});
