/**
 * Occurrence helpers. Pure: no database, no network.
 *
 * Generated schedule entries carry the id "<scheduleId>:<YYYY-MM-DD>".
 * One-off ids are cuids and contain no colon.
 */

import type { EntryDirection, Schedule } from '../projection/types';

export type EntryRef =
  | { kind: 'ONE_OFF'; id: string }
  | { kind: 'OCCURRENCE'; scheduleId: string; occurrenceDate: string };

const OCCURRENCE_ID = /^(.+):(\d{4}-\d{2}-\d{2})$/;

/** Split an entry id into a one-off reference or a (schedule, original date) reference. */
export function parseEntryRef(id: string): EntryRef {
  const match = OCCURRENCE_ID.exec(id);
  if (match) {
    return { kind: 'OCCURRENCE', scheduleId: match[1], occurrenceDate: match[2] };
  }
  return { kind: 'ONE_OFF', id };
}

export interface OccurrenceRecordData {
  scheduleId: string;
  accountId: string;
  /** Original (unshifted) occurrence date, 'YYYY-MM-DD'. */
  occurrenceDate: string;
  status: 'POSTED' | 'SKIPPED';
  entryType: EntryDirection;
  description: string;
  /** Signed by direction: income positive, debit negative. */
  estimatedAmountCents: number;
  /** Signed by direction; null when SKIPPED. */
  actualAmountCents: number | null;
  /** 'YYYY-MM-DD'; null when SKIPPED. */
  actualDate: string | null;
}

function signed(entryType: EntryDirection, cents: number): number {
  const magnitude = Math.abs(cents);
  return entryType === 'INCOME' ? magnitude : -magnitude;
}

export function buildOccurrenceRecord(
  schedule: Pick<Schedule, 'id' | 'accountId' | 'name' | 'entryType' | 'estimatedAmountCents'>,
  occurrenceDate: string,
  outcome:
    | { status: 'POSTED'; actualAmountCents: number; actualDate: string }
    | { status: 'SKIPPED' },
): OccurrenceRecordData {
  const base = {
    scheduleId: schedule.id,
    accountId: schedule.accountId,
    occurrenceDate,
    entryType: schedule.entryType,
    description: schedule.name,
    estimatedAmountCents: signed(schedule.entryType, schedule.estimatedAmountCents),
  };
  if (outcome.status === 'SKIPPED') {
    return { ...base, status: 'SKIPPED', actualAmountCents: null, actualDate: null };
  }
  return {
    ...base,
    status: 'POSTED',
    actualAmountCents: signed(schedule.entryType, outcome.actualAmountCents),
    actualDate: outcome.actualDate,
  };
}
