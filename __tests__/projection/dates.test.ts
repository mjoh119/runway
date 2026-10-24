import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, daysInMonth } from '@/lib/projection/dates';

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-03-11', 5)).toBe('2026-03-16');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2028-01-01', 366)).toBe('2029-01-01');
  });

  it('returns the same date for zero', () => {
    expect(addDays('2026-03-11', 0)).toBe('2026-03-11');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => addDays('2026-3-1', 1)).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});

describe('dayOfWeek', () => {
  it('returns 0 for Sunday through 6 for Saturday', () => {
    expect(dayOfWeek('2026-03-08')).toBe(0); // Sunday
    expect(dayOfWeek('2026-03-09')).toBe(1); // Monday
    expect(dayOfWeek('2026-03-14')).toBe(6); // Saturday
  });

  it('handles a leap day', () => {
    expect(dayOfWeek('2028-02-29')).toBe(2); // Tuesday
  });
});

describe('daysInMonth (month is 0-indexed)', () => {
  it('returns 31 for January and 30 for April', () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 3)).toBe(30);
  });

  it('returns 28 or 29 for February depending on leap year', () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });

  it('returns 31 for December', () => {
    expect(daysInMonth(2026, 11)).toBe(31);
  });
});
