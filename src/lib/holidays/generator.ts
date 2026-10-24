/**
 * Rule-based Federal Reserve holiday generator. Pure: no I/O.
 *
 * Observance rules (Federal Reserve):
 * - A holiday on a Sunday is observed on the following Monday.
 * - A holiday on a Saturday stays on Saturday; the Fed is open the preceding Friday.
 */

import { addDays, dayOfWeek, daysInMonth } from '../projection/dates';

function iso(year: number, month: number, day: number): string {
  // month is 0-indexed, matching dates.ts
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Apply Federal Reserve observance rules to an ISO date string.
 * Sunday -> following Monday; every other day unchanged (including Saturday).
 * Returns 'YYYY-MM-DD'.
 */
export function applyObservanceRules(isoDate: string): string {
  return dayOfWeek(isoDate) === 0 ? addDays(isoDate, 1) : isoDate;
}

/** nth (1-based) occurrence of a weekday (0 = Sunday) in a 0-indexed month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const firstDow = dayOfWeek(iso(year, month, 1));
  const day = 1 + ((weekday - firstDow + 7) % 7) + 7 * (n - 1);
  return iso(year, month, day);
}

/** Last occurrence of a weekday (0 = Sunday) in a 0-indexed month. */
function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDay = daysInMonth(year, month);
  const lastDow = dayOfWeek(iso(year, month, lastDay));
  return iso(year, month, lastDay - ((lastDow - weekday + 7) % 7));
}

/**
 * The 11 Federal Reserve holidays for a calendar year, as observed dates.
 * (A Sunday New Year's Day on Jan 1 shifts to Jan 2; a Saturday Jan 1 stays put.)
 */
export function generateFederalHolidays(year: number): string[] {
  const MON = 1;
  const THU = 4;
  return [
    applyObservanceRules(iso(year, 0, 1)), // New Year's Day
    nthWeekday(year, 0, MON, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 1, MON, 3), // Washington's Birthday (Presidents Day)
    lastWeekday(year, 4, MON), // Memorial Day
    applyObservanceRules(iso(year, 5, 19)), // Juneteenth
    applyObservanceRules(iso(year, 6, 4)), // Independence Day
    nthWeekday(year, 8, MON, 1), // Labor Day
    nthWeekday(year, 9, MON, 2), // Columbus Day
    applyObservanceRules(iso(year, 10, 11)), // Veterans Day
    nthWeekday(year, 10, THU, 4), // Thanksgiving
    applyObservanceRules(iso(year, 11, 25)), // Christmas Day
  ];
}
