import { addDays } from './dates';
import type { Entry, PayCycle } from './types';

/**
 * Compute pay-cycle boundaries from income entries. Pure: no I/O, inputs are not mutated.
 *
 * - A cycle runs from one INCOME entry's shifted post date to the day before the
 *   next income entry's shifted post date. Scheduled and one-off income both count.
 * - SKIPPED entries never create boundaries.
 * - The current cycle starts at the latest income on or before `currentDate`; if there
 *   is none, the first cycle starts at `currentDate` with `incomeEntryId: null`.
 * - Income after the first one on the same date is absorbed (no zero-length cycles).
 * - Income dated after `projectionEndDate` creates no boundary; the last cycle ends at
 *   `projectionEndDate`.
 *
 * All dates are 'YYYY-MM-DD' strings.
 */
export function computePayCycles(
  entries: readonly Entry[],
  currentDate: string,
  projectionEndDate: string,
): PayCycle[] {
  if (projectionEndDate < currentDate) return [];

  const incomes = entries
    .filter((e) => e.entryType === 'INCOME' && e.status !== 'SKIPPED')
    .slice()
    .sort((a, b) =>
      a.shiftedPostDate < b.shiftedPostDate ? -1 : a.shiftedPostDate > b.shiftedPostDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );

  // One boundary per distinct date (first entry by id wins).
  const boundaries: { date: string; id: string }[] = [];
  for (const e of incomes) {
    if (e.shiftedPostDate > projectionEndDate) break;
    const last = boundaries[boundaries.length - 1];
    if (last && last.date === e.shiftedPostDate) continue;
    boundaries.push({ date: e.shiftedPostDate, id: e.id });
  }

  // Latest boundary on or before currentDate starts the current cycle.
  let firstFuture = boundaries.findIndex((b) => b.date > currentDate);
  if (firstFuture === -1) firstFuture = boundaries.length;

  const starts: { date: string; id: string | null }[] =
    firstFuture > 0
      ? [{ date: boundaries[firstFuture - 1].date, id: boundaries[firstFuture - 1].id }]
      : [{ date: currentDate, id: null }];
  for (let i = firstFuture; i < boundaries.length; i++) {
    starts.push({ date: boundaries[i].date, id: boundaries[i].id });
  }

  return starts.map((s, i) => ({
    startDate: s.date,
    endDate: i + 1 < starts.length ? addDays(starts[i + 1].date, -1) : projectionEndDate,
    incomeEntryId: s.id,
  }));
}
