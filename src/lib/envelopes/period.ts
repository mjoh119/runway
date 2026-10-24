import { addDays, dayOfWeek, daysInMonth } from '../projection/dates';
import type { EnvelopePeriod, ResetPeriod } from './types';

/** Length of an EACH_PAY_CYCLE period with no later scheduled income (30 days). */
const OPEN_ENDED_DAYS = 30;

function sortedUnique(dates: readonly string[]): string[] {
  // 'YYYY-MM-DD' strings sort chronologically as plain strings.
  return [...new Set(dates)].sort();
}

function weekly(date: string): EnvelopePeriod {
  const offset = (dayOfWeek(date) + 6) % 7; // Monday = 0 ... Sunday = 6
  const start = addDays(date, -offset);
  return { start, end: addDays(start, 6) };
}

function monthly(date: string): EnvelopePeriod {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)); // 1-indexed
  const last = daysInMonth(year, month - 1);
  const prefix = date.slice(0, 8); // 'YYYY-MM-'
  return { start: `${prefix}01`, end: `${prefix}${String(last).padStart(2, '0')}` };
}

function payCycle(
  date: string,
  incomeDates: readonly string[],
  fallbackStart: string,
): EnvelopePeriod {
  const sorted = sortedUnique(incomeDates);
  let startIncome: string | undefined;
  let nextIncome: string | undefined;
  for (const d of sorted) {
    if (d <= date) startIncome = d;
    else {
      nextIncome = d;
      break;
    }
  }
  const start = startIncome ?? (fallbackStart < date ? fallbackStart : date);
  const end = nextIncome ? addDays(nextIncome, -1) : addDays(start, OPEN_ENDED_DAYS - 1);
  return { start, end };
}

/**
 * The Envelope_Period containing `date`.
 *
 * `incomeDates` are shifted Scheduled_Income dates only (any order). One-off
 * income and skipped occurrences must be excluded by the caller.
 * `fallbackStart` (the Current_Date) starts an EACH_PAY_CYCLE period when no
 * income falls on or before `date`.
 */
export function periodContaining(
  resetPeriod: ResetPeriod,
  date: string,
  incomeDates: readonly string[],
  fallbackStart: string,
): EnvelopePeriod {
  switch (resetPeriod) {
    case 'WEEKLY':
      return weekly(date);
    case 'MONTHLY':
      return monthly(date);
    case 'EACH_PAY_CYCLE':
      return payCycle(date, incomeDates, fallbackStart);
  }
}

/**
 * The period immediately before `current`, or null when it cannot be
 * determined (EACH_PAY_CYCLE with no scheduled income before current.start).
 */
export function precedingPeriod(
  resetPeriod: ResetPeriod,
  current: EnvelopePeriod,
  incomeDates: readonly string[],
): EnvelopePeriod | null {
  const dayBefore = addDays(current.start, -1);
  switch (resetPeriod) {
    case 'WEEKLY':
      return weekly(dayBefore);
    case 'MONTHLY':
      return monthly(dayBefore);
    case 'EACH_PAY_CYCLE': {
      const earlier = sortedUnique(incomeDates).filter((d) => d < current.start);
      const start = earlier[earlier.length - 1];
      if (start === undefined) return null;
      return { start, end: dayBefore };
    }
  }
}
