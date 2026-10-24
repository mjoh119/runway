import { addDays, dayOfWeek } from './dates';
import type { EntryDirection } from './types';

/**
 * True when the date is not a Saturday, not a Sunday, and not in the holiday list.
 * Pure: the holiday list is passed in (no I/O).
 */
export function isBusinessDay(date: string, holidays: readonly string[]): boolean {
  const dow = dayOfWeek(date);
  if (dow === 0 || dow === 6) return false;
  return !holidays.includes(date);
}

/**
 * Shifts a post date to its settlement date.
 * DEBIT moves to the next business day; INCOME to the prior business day.
 * Consecutive non-business days are skipped; business days return unchanged.
 */
export function shiftDate(
  date: string,
  direction: EntryDirection,
  holidays: readonly string[],
): string {
  const step = direction === 'DEBIT' ? 1 : -1;
  let current = date;
  while (!isBusinessDay(current, holidays)) {
    current = addDays(current, step);
  }
  return current;
}
