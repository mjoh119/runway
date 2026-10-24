/**
 * Pure helper: every calendar year touched by an inclusive date range.
 * Dates are 'YYYY-MM-DD' strings. No I/O.
 */
export function calendarYearsTouched(startDate: string, endDate: string): number[] {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
  }
  if (endYear < startYear) return [];
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
}
