/**
 * Pure helpers: name of the Federal Reserve holiday observed on a date, and the
 * human-readable reason an entry moved. No I/O.
 * Uses the same observance rules as generateFederalHolidays.
 */

import { formatMonthDay } from '../format';
import { dayOfWeek, weekdayAbbr } from '../projection/dates';
import { generateNamedFederalHolidays } from './generator';

/** Holiday name for an observed date, or null when the date is not a Federal Reserve holiday. */
export function federalHolidayName(date: string): string | null {
  const year = Number(date.slice(0, 4));
  // Neighbouring years cover observances that cross the year boundary.
  for (const y of [year, year + 1, year - 1]) {
    const hit = generateNamedFederalHolidays(y).find((h) => h.date === date);
    if (hit) return hit.name;
  }
  return null;
}

/**
 * Reason text for an entry whose date moved, from its ORIGINAL post date.
 * Weekend wins: "moved from Sat Oct 24". Otherwise the holiday is named:
 * "moved from Mon Jan 19, MLK Day". Falls back to "bank holiday".
 */
export function shiftReason(originalDate: string): string {
  const dow = dayOfWeek(originalDate);
  const when = `${weekdayAbbr(originalDate)} ${formatMonthDay(originalDate)}`;
  if (dow === 0 || dow === 6) return `moved from ${when}`;
  return `moved from ${when}, ${federalHolidayName(originalDate) ?? 'bank holiday'}`;
}
