// Pure view-model helper for the Overview page cards. No I/O, inputs are not mutated.
// Money is integer cents; dates are 'YYYY-MM-DD' strings handled with the UTC helpers
// in projection/dates.ts (never toISOString on local dates).

import { formatCents, formatMonthDay } from './format';
import { shiftReason } from './holidays/names';
import { daysBetween, weekdayAbbr } from './projection/dates';
import type { Entry, ProjectionOutput } from './projection/types';

export type OverviewProjection = Pick<
  ProjectionOutput,
  'balances' | 'runway' | 'payCycles' | 'upcomingEntries' | 'warnings'
>;

export interface NextPayday {
  date: string; // shifted post date
  amountCents: number; // positive: actual ?? estimate
  name: string; // entry description
}

export interface CycleSummary {
  /** Real start of the current cycle (may be before today). */
  startDate: string;
  endDate: string;
  /** Sum of |amount| of PLANNED/PENDING DEBITs in the cycle (see buildCycleSummary). */
  plannedOutCents: number;
  /** Sum of |amount| of PLANNED/PENDING INCOME in the cycle. */
  plannedInCents: number;
  overdueCount: number;
}

export interface UpcomingRow {
  id: string;
  description: string;
  /** Debit negative, income positive; actual ?? estimate. */
  amountCents: number;
  status: 'overdue' | 'pending' | null;
  shifted: { originalDate: string; text: string } | null;
  /** Overdue rows only, e.g. "Due Mon, Oct 19". */
  dueText?: string;
}

export interface UpcomingGroup {
  /** 'overdue' or the group's 'YYYY-MM-DD' date. */
  key: string;
  /** "Overdue", "Today · Fri, Oct 23" or "Mon, Oct 26". */
  label: string;
  /** Null for the overdue group. */
  date: string | null;
  rows: UpcomingRow[];
}

export interface LedgerDifferenceItem {
  description: string;
  amountCents: number;
  kind: 'Pending' | 'On hold';
  holdReleaseDate?: string;
  /** e.g. "$60.00 pending at Grocery store" or "$40.00 deposit on hold until Sat Oct 24". */
  text: string;
}

export interface OverviewViewModel {
  /** Whole days from today to the next payday; null unless the runway is bounded by a payday. */
  daysUntilPayday: number | null;
  nextPayday: NextPayday | null;
  availableNowCents: number | null;
  ledgerNowCents: number | null;
  cycleSummary: CycleSummary | null;
  upcomingGroups: UpcomingGroup[];
  ledgerDifferenceItems: LedgerDifferenceItem[];
}

const isOpen = (e: Entry): boolean => e.status === 'PLANNED' || e.status === 'PENDING';
const absAmount = (e: Entry): number => Math.abs(e.actualAmountCents ?? e.estimatedAmountCents);
const signedAmount = (e: Entry): number => (e.entryType === 'INCOME' ? absAmount(e) : -absAmount(e));
const byDateThenId = (a: Entry, b: Entry): number =>
  a.shiftedPostDate < b.shiftedPostDate ? -1 : a.shiftedPostDate > b.shiftedPostDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** "Mon, Oct 26" */
function dayLabel(date: string): string {
  return `${weekdayAbbr(date)}, ${formatMonthDay(date)}`;
}

/** Earliest non-skipped INCOME entry strictly after `today`; ties broken by id. */
export function findNextPayday(upcomingEntries: readonly Entry[], today: string): NextPayday | null {
  const next = upcomingEntries
    .filter((e) => e.entryType === 'INCOME' && e.status !== 'SKIPPED' && e.shiftedPostDate > today)
    .sort(byDateThenId)[0];
  return next ? { date: next.shiftedPostDate, amountCents: absAmount(next), name: next.description ?? 'Income' } : null;
}

/**
 * Summary of the CURRENT cycle (payCycles[0]), or null when there are no cycles.
 *
 * Counted entries (each at actual ?? estimate, absolute value):
 *  - upcoming entries (shifted date today or later) dated within the cycle's end date, and
 *  - overdue entries (the engine counts these at their estimate on today).
 * Only PLANNED/PENDING entries count; POSTED and SKIPPED never do. DEBITs go to
 * plannedOut, INCOME to plannedIn. A PENDING debit still counts as planned out
 * (it has not settled in the ledger yet). The cycle's own start deposit and the next
 * payday (which opens the next cycle) are not counted.
 */
export function buildCycleSummary(projection: OverviewProjection, today: string): CycleSummary | null {
  const cycle = projection.payCycles[0];
  if (!cycle) return null;

  const overdue = projection.warnings.overdueEntries ?? [];
  const overdueIds = new Set(overdue.map((e) => e.id));
  const inCycle = projection.upcomingEntries.filter(
    (e) => !overdueIds.has(e.id) && e.shiftedPostDate >= today && e.shiftedPostDate <= cycle.endDate,
  );

  let plannedOutCents = 0;
  let plannedInCents = 0;
  for (const e of [...overdue, ...inCycle]) {
    if (!isOpen(e)) continue;
    if (e.entryType === 'DEBIT') plannedOutCents += absAmount(e);
    else plannedInCents += absAmount(e);
  }

  return {
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    plannedOutCents,
    plannedInCents,
    overdueCount: overdue.length,
  };
}

function toRow(e: Entry, overdue: boolean): UpcomingRow {
  const moved = e.shiftedPostDate !== e.postDate;
  const reason = moved ? shiftReason(e.postDate) : null;
  const row: UpcomingRow = {
    id: e.id,
    description: e.description ?? (e.entryType === 'INCOME' ? 'Income' : 'Bill'),
    amountCents: signedAmount(e),
    status: overdue ? 'overdue' : e.status === 'PENDING' ? 'pending' : null,
    shifted: reason ? { originalDate: e.postDate, text: reason.charAt(0).toUpperCase() + reason.slice(1) } : null,
  };
  if (overdue) row.dueText = `Due ${dayLabel(e.shiftedPostDate)}`;
  return row;
}

/**
 * Upcoming list: an "Overdue" group first, then "Today · Fri, Oct 23" (if anything is
 * dated today), then one group per later date ("Mon, Oct 26"). POSTED/SKIPPED are not listed.
 */
export function buildUpcomingGroups(projection: OverviewProjection, today: string): UpcomingGroup[] {
  const overdue = [...(projection.warnings.overdueEntries ?? [])].filter(isOpen).sort(byDateThenId);
  const overdueIds = new Set(overdue.map((e) => e.id));
  const groups: UpcomingGroup[] = [];

  if (overdue.length > 0) {
    groups.push({ key: 'overdue', label: 'Overdue', date: null, rows: overdue.map((e) => toRow(e, true)) });
  }

  const upcoming = projection.upcomingEntries
    .filter((e) => isOpen(e) && !overdueIds.has(e.id) && e.shiftedPostDate >= today)
    .sort(byDateThenId);
  for (const e of upcoming) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.shiftedPostDate) {
      last.rows.push(toRow(e, false));
      continue;
    }
    const date = e.shiftedPostDate;
    groups.push({
      key: date,
      label: date === today ? `Today · ${dayLabel(date)}` : dayLabel(date),
      date,
      rows: [toRow(e, false)],
    });
  }
  return groups;
}

/** Items for the "Why available isn't the same as ledger" card (from the engine output). */
export function buildLedgerDifferenceItems(projection: Pick<OverviewProjection, 'warnings'>): LedgerDifferenceItem[] {
  const items = projection.warnings.availableBalanceDifference?.items ?? [];
  return items.map((it) => ({
    ...it,
    text:
      it.kind === 'Pending'
        ? `${formatCents(it.amountCents)} pending at ${it.description}`
        : `${formatCents(it.amountCents)} deposit on hold${it.holdReleaseDate ? ` until ${weekdayAbbr(it.holdReleaseDate)} ${formatMonthDay(it.holdReleaseDate)}` : ''}`,
  }));
}

/**
 * Build everything the Overview cards need. `today` is the projection start
 * (the visitor's local date, balances[0].date).
 */
export function buildOverviewViewModel(projection: OverviewProjection, today: string): OverviewViewModel {
  const nextPayday = findNextPayday(projection.upcomingEntries, today);
  const bounded = projection.runway?.isBeforePayday === true && nextPayday !== null;
  const first = projection.balances[0];

  return {
    daysUntilPayday: bounded ? daysBetween(today, nextPayday.date) : null,
    nextPayday,
    availableNowCents: first ? first.availableBalanceCents : null,
    ledgerNowCents: first ? first.ledgerBalanceCents : null,
    cycleSummary: buildCycleSummary(projection, today),
    upcomingGroups: buildUpcomingGroups(projection, today),
    ledgerDifferenceItems: buildLedgerDifferenceItems(projection),
  };
}
