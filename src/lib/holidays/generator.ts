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

export interface NamedHoliday {
  name: string;
  date: string; // observed date, 'YYYY-MM-DD'
}

/** The 11 Federal Reserve holidays for a calendar year with names, as observed dates. */
export function generateNamedFederalHolidays(year: number): NamedHoliday[] {
  const MON = 1;
  const THU = 4;
  return [
    { name: "New Year's Day", date: applyObservanceRules(iso(year, 0, 1)) },
    { name: 'MLK Day', date: nthWeekday(year, 0, MON, 3) },
    { name: 'Presidents Day', date: nthWeekday(year, 1, MON, 3) },
    { name: 'Memorial Day', date: lastWeekday(year, 4, MON) },
    { name: 'Juneteenth', date: applyObservanceRules(iso(year, 5, 19)) },
    { name: 'Independence Day', date: applyObservanceRules(iso(year, 6, 4)) },
    { name: 'Labor Day', date: nthWeekday(year, 8, MON, 1) },
    { name: 'Columbus Day', date: nthWeekday(year, 9, MON, 2) },
    { name: 'Veterans Day', date: applyObservanceRules(iso(year, 10, 11)) },
    { name: 'Thanksgiving', date: nthWeekday(year, 10, THU, 4) },
    { name: 'Christmas Day', date: applyObservanceRules(iso(year, 11, 25)) },
  ];
}

/**
 * The 11 Federal Reserve holidays for a calendar year, as observed dates.
 * (A Sunday New Year's Day on Jan 1 shifts to Jan 2; a Saturday Jan 1 stays put.)
 */
export function generateFederalHolidays(year: number): string[] {
  return generateNamedFederalHolidays(year).map((h) => h.date);
}