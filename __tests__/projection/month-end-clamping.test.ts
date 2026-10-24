import { describe, expect, it } from 'vitest';
import { clampDayOfMonth, generateEntries } from '@/lib/projection/engine';
import type { Schedule } from '@/lib/projection/types';

// Validates: Requirements 4.4

describe('clampDayOfMonth (month is 0-indexed)', () => {
  it('clamps day 31 to 28 in a non-leap February', () => {
    expect(clampDayOfMonth(2026, 1, 31)).toBe(28);
  });

  it('clamps day 31 to 29 in a leap February', () => {
    expect(clampDayOfMonth(2028, 1, 31)).toBe(29);
  });

  it('clamps day 31 to 30 in April', () => {
    expect(clampDayOfMonth(2026, 3, 31)).toBe(30);
  });

  it('leaves day 31 unchanged in January', () => {
    expect(clampDayOfMonth(2026, 0, 31)).toBe(31);
  });
});

describe('generateEntries with a day-31 DAYS_OF_MONTH schedule', () => {
  const schedule: Schedule = {
    id: 'rent',
    name: 'Rent',
    accountId: 'acct-1',
    intervalType: 'DAYS_OF_MONTH',
    intervalValue: 1,
    daysOfMonth: [31],
    startDate: '2026-01-01',
    estimatedAmountCents: 100000,
    entryType: 'DEBIT',
  };

  it('clamps postDate to the month end, then business-day shifts it', () => {
    const entries = generateEntries(schedule, '2026-01-01', '2026-04-30', []);
    const byPost = Object.fromEntries(entries.map((e) => [e.postDate, e.shiftedPostDate]));

    // Jan 31 2026 is a Saturday -> next business day (debit)
    expect(byPost['2026-01-31']).toBe('2026-02-02');
    // Feb clamps to 28 (Saturday) -> Monday Mar 2
    expect(byPost['2026-02-28']).toBe('2026-03-02');
    // Mar 31 2026 is a Tuesday -> unchanged
    expect(byPost['2026-03-31']).toBe('2026-03-31');
    // Apr clamps to 30 (Thursday) -> unchanged
    expect(byPost['2026-04-30']).toBe('2026-04-30');
    expect(entries).toHaveLength(4);
  });

  it('clamps to Feb 29 in a leap year', () => {
    const entries = generateEntries(schedule, '2028-02-01', '2028-02-29', []);
    expect(entries).toHaveLength(1);
    expect(entries[0].postDate).toBe('2028-02-29');
    expect(entries[0].shiftedPostDate).toBe('2028-02-29'); // Tuesday
  });
});
