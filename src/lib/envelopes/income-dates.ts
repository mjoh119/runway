import { generateEntries } from '../projection/engine';
import { shiftDate } from '../projection/shift';
import type { Entry, Schedule } from '../projection/types';

export interface IncomeDateSources {
  schedules: readonly Schedule[];
  /** POSTED or SKIPPED occurrence records. Never one-off entries. */
  occurrenceRecords: readonly Entry[];
  holidays: readonly string[];
  /** Lookback start (inclusive). */
  from: string;
  /** Generation end (inclusive). */
  to: string;
}

/**
 * Shifted dates of Scheduled_Income only, sorted and de-duplicated.
 *
 * - Generated occurrences that have an Occurrence_Record are dropped.
 * - Non-SKIPPED INCOME records are added, with their original post date shifted.
 * - One-off entries are not an input, so one-off income can never appear.
 *
 * Pure: no I/O; holidays arrive as an argument.
 */
export function collectScheduledIncomeDates(src: IncomeDateSources): string[] {
  const recordKeys = new Set(
    src.occurrenceRecords
      .filter((r) => r.scheduleId !== undefined)
      .map((r) => `${r.scheduleId}|${r.postDate}`),
  );

  const dates = new Set<string>();

  for (const schedule of src.schedules) {
    if (schedule.entryType !== 'INCOME') continue;
    for (const entry of generateEntries(schedule, src.from, src.to, src.holidays)) {
      if (recordKeys.has(`${entry.scheduleId}|${entry.postDate}`)) continue;
      dates.add(entry.shiftedPostDate);
    }
  }

  for (const record of src.occurrenceRecords) {
    if (record.entryType !== 'INCOME' || record.status === 'SKIPPED') continue;
    dates.add(shiftDate(record.postDate, 'INCOME', src.holidays));
  }

  return [...dates].sort();
}
