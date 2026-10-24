import { addDays, daysInMonth } from './dates';
import { shiftDate } from './shift';
import { computePayCycles } from './cycle';
import { computeRunway } from './runway';
import { buildWarnings } from './warnings';
import type {
  Entry,
  ProjectedBalance,
  ProjectionInput,
  ProjectionOutput,
  Schedule,
} from './types';

// Re-exported so the design's import paths (`./engine`) work.
export { shiftDate, isBusinessDay } from './shift';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const INTERVAL_BOUNDS = {
  DAYS: { min: 1, max: 365, unit: 'days' },
  WEEKS: { min: 1, max: 52, unit: 'weeks' },
  MONTHS: { min: 1, max: 12, unit: 'months' },
} as const;

/**
 * Clamp a day of the month to the month's last day.
 * `month` is 0-indexed (0 = January), matching Date.UTC.
 * E.g. day 31 in February becomes 28 (or 29 in a leap year).
 */
export function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/**
 * Throws a descriptive error when a schedule's interval is invalid:
 * zero, negative, non-integer, or outside the bounds for its interval type.
 */
export function validateSchedule(schedule: Schedule): void {
  const { intervalType, intervalValue, daysOfMonth } = schedule;

  if (intervalType === 'DAYS_OF_MONTH') {
    if (!Array.isArray(daysOfMonth) || daysOfMonth.length === 0) {
      throw new Error(
        `Invalid interval value for schedule ${schedule.id}: DAYS_OF_MONTH requires at least one day of the month (1 to 31)`,
      );
    }
    for (const d of daysOfMonth) {
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        throw new Error(
          `Invalid interval value for schedule ${schedule.id}: day of month ${d} must be an integer from 1 to 31`,
        );
      }
    }
    return;
  }

  const bounds = INTERVAL_BOUNDS[intervalType];
  if (!bounds) {
    throw new Error(`Invalid interval type for schedule ${schedule.id}: ${String(intervalType)}`);
  }
  if (!Number.isInteger(intervalValue) || intervalValue < bounds.min || intervalValue > bounds.max) {
    throw new Error(
      `Invalid interval value for schedule ${schedule.id}: ${intervalValue} must be an integer from ${bounds.min} to ${bounds.max} (every N ${bounds.unit})`,
    );
  }
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseParts(date: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

/**
 * Raw (unshifted) post dates for a schedule, ascending, on or after the
 * schedule's own start date and not after `endDate`. Dates before `rangeStart`
 * are skipped but do not change the schedule's anchor.
 */
function occurrenceDates(schedule: Schedule, rangeStart: string, endDate: string): string[] {
  const first = schedule.startDate > rangeStart ? schedule.startDate : rangeStart;
  const dates: string[] = [];
  const keep = (d: string) => {
    if (d >= first && d <= endDate) dates.push(d);
  };

  switch (schedule.intervalType) {
    case 'DAYS':
    case 'WEEKS': {
      const step = schedule.intervalValue * (schedule.intervalType === 'WEEKS' ? 7 : 1);
      for (let d = schedule.startDate; d <= endDate; d = addDays(d, step)) keep(d);
      break;
    }
    case 'MONTHS': {
      // Anchor on the start date's day each time so clamping never drifts
      // (Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
      const s = parseParts(schedule.startDate);
      for (let k = 0; ; k += schedule.intervalValue) {
        const total = s.month + k;
        const year = s.year + Math.floor(total / 12);
        const month = total % 12;
        const d = formatDate(year, month, clampDayOfMonth(year, month, s.day));
        if (d > endDate) break;
        keep(d);
      }
      break;
    }
    case 'DAYS_OF_MONTH': {
      const s = parseParts(schedule.startDate);
      const e = parseParts(endDate);
      const days = [...schedule.daysOfMonth].sort((a, b) => a - b);
      const lastIndex = e.year * 12 + e.month;
      for (let idx = s.year * 12 + s.month; idx <= lastIndex; idx++) {
        const year = Math.floor(idx / 12);
        const month = idx % 12;
        // Several chosen days can clamp to the same date (e.g. 30 and 31 in February).
        const seen = new Set<string>();
        for (const day of days) {
          const d = formatDate(year, month, clampDayOfMonth(year, month, day));
          if (seen.has(d)) continue;
          seen.add(d);
          keep(d);
        }
      }
      break;
    }
  }
  return dates;
}

/**
 * Generate planned entries for a schedule with post dates in
 * [max(startDate, schedule.startDate), endDate], inclusive.
 * Days 29 to 31 are clamped to the month's last day before business-day
 * shifting. `shiftedPostDate` is computed with `shiftDate` using the entry
 * direction and the supplied holiday list. Pure: no I/O.
 * Throws if the schedule is invalid (see `validateSchedule`).
 */
export function generateEntries(
  schedule: Schedule,
  startDate: string,
  endDate: string,
  holidays: readonly string[],
): Entry[] {
  validateSchedule(schedule);
  if (endDate < startDate) return [];

  return occurrenceDates(schedule, startDate, endDate).map((postDate) => ({
    id: `${schedule.id}:${postDate}`,
    accountId: schedule.accountId,
    scheduleId: schedule.id,
    postDate,
    shiftedPostDate: shiftDate(postDate, schedule.entryType, holidays),
    estimatedAmountCents: schedule.estimatedAmountCents,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: schedule.entryType,
    description: schedule.name,
  }));
}

export { computePayCycles } from './cycle';

// ---------------------------------------------------------------------------
// Balance projection
// ---------------------------------------------------------------------------

function entryAmount(entry: Entry): number {
  return Math.abs(entry.actualAmountCents ?? entry.estimatedAmountCents);
}

/**
 * Estimate the available balance when the source does not report one:
 * ledger minus pending debits minus posted deposits still on hold.
 * A deposit is on hold when its `holdReleaseDate` is after `asOfDate`
 * (when `asOfDate` is omitted, any posted deposit with a hold date counts).
 * Pure: does not mutate its inputs.
 */
export function estimateAvailableBalance(
  ledgerCents: number,
  entries: readonly Entry[],
  asOfDate?: string,
): number {
  let available = ledgerCents;
  for (const e of entries) {
    if (e.status === 'PENDING' && e.entryType === 'DEBIT') {
      available -= entryAmount(e);
    } else if (
      e.status === 'POSTED' &&
      e.entryType === 'INCOME' &&
      e.holdReleaseDate !== undefined &&
      (asOfDate === undefined || e.holdReleaseDate > asOfDate)
    ) {
      available -= entryAmount(e);
    }
  }
  return available;
}

/**
 * Project daily ledger and available balances over [startDate, endDate],
 * one row per day, inclusive. Starting balances are assumed to already
 * include posted, pending and held items, so only future events are applied.
 * Rows are flagged `isEstimated` when `startingAvailableCents` is null, in
 * which case the starting available balance is estimated from `entries`.
 * Pure: input arrays are never mutated.
 */
export function projectBalances(
  startingLedgerCents: number,
  startingAvailableCents: number | null,
  entries: readonly Entry[],
  startDate: string,
  endDate: string,
): ProjectedBalance[] {
  if (endDate < startDate) return [];

  const isEstimated = startingAvailableCents === null;
  const startAvailable =
    startingAvailableCents ?? estimateAvailableBalance(startingLedgerCents, entries, startDate);

  // Net change per date, for each balance.
  const ledgerDelta = new Map<string, number>();
  const availableDelta = new Map<string, number>();
  const add = (map: Map<string, number>, date: string, cents: number) => {
    const d = date < startDate ? startDate : date; // overdue items land on the start date
    if (d > endDate) return;
    map.set(d, (map.get(d) ?? 0) + cents);
  };

  for (const e of entries) {
    if (e.status === 'SKIPPED') continue;
    const amount = entryAmount(e);
    const signed = e.entryType === 'INCOME' ? amount : -amount;

    if (e.status === 'PLANNED') {
      add(ledgerDelta, e.shiftedPostDate, signed);
      const availableDate =
        e.entryType === 'INCOME' && e.holdReleaseDate !== undefined
          ? e.holdReleaseDate > e.shiftedPostDate
            ? e.holdReleaseDate
            : e.shiftedPostDate
          : e.shiftedPostDate;
      add(availableDelta, availableDate, signed);
    } else if (e.status === 'PENDING') {
      // Pending debits already reduced available; only the ledger is still to move.
      if (e.entryType === 'DEBIT') add(ledgerDelta, e.shiftedPostDate, signed);
    } else if (e.status === 'POSTED') {
      // Posted deposit still on hold: ledger already has it, available does not.
      if (
        e.entryType === 'INCOME' &&
        e.holdReleaseDate !== undefined &&
        e.holdReleaseDate > startDate
      ) {
        add(availableDelta, e.holdReleaseDate, signed);
      }
    }
  }

  const rows: ProjectedBalance[] = [];
  let ledger = startingLedgerCents;
  let available = startAvailable;
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    ledger += ledgerDelta.get(date) ?? 0;
    available += availableDelta.get(date) ?? 0;
    rows.push({
      date,
      ledgerBalanceCents: ledger,
      availableBalanceCents: available,
      isEstimated,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Schedule entries are generated this far out so the cycle after the next income can be found. */
const GENERATION_SPAN_DAYS = 800;

const compareEntries = (a: Entry, b: Entry): number =>
  a.shiftedPostDate < b.shiftedPostDate
    ? -1
    : a.shiftedPostDate > b.shiftedPostDate
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

/**
 * Main projection: generates entries, shifts dates, builds pay cycles, projects
 * balances on the primary account, computes runway, and builds warnings.
 * Pure: never mutates `input`, performs no I/O. Holidays arrive as an argument.
 * Throws on an invalid current date or a horizon outside 1 to 365 days.
 */
export function projectCashFlow(input: ProjectionInput): ProjectionOutput {
  const { accounts, schedules, oneOffEntries, holidays, currentDate, projectionHorizonDays } = input;

  parseParts(currentDate); // throws on malformed dates
  if (
    !Number.isInteger(projectionHorizonDays) ||
    projectionHorizonDays < 1 ||
    projectionHorizonDays > 365
  ) {
    throw new Error(
      `Invalid projection horizon: ${projectionHorizonDays} must be an integer from 1 to 365 days`,
    );
  }

  const primary = accounts.find((a) => a.isPrimary);
  const inScope = (e: Entry) => primary === undefined || e.accountId === primary.id;

  // Schedule entries (on/after currentDate) over a wide window, plus one-offs with
  // shifted dates recomputed. One-offs before currentDate are kept (overdue, holds).
  const wideEnd = addDays(currentDate, GENERATION_SPAN_DAYS);
  const records = input.occurrenceRecords ?? [];
  const recordKeys = new Set(records.map((r) => `${r.scheduleId}|${r.postDate}`));
  const candidates: Entry[] = [];
  for (const s of schedules) {
    for (const g of generateEntries(s, currentDate, wideEnd, holidays)) {
      if (!recordKeys.has(`${g.scheduleId}|${g.postDate}`)) candidates.push(g);
    }
  }
  for (const r of records) {
    candidates.push({
      ...r,
      id: `${r.scheduleId}:${r.postDate}`,
      shiftedPostDate: shiftDate(r.postDate, r.entryType, holidays),
    });
  }
  for (const e of oneOffEntries) {
    candidates.push({ ...e, shiftedPostDate: shiftDate(e.postDate, e.entryType, holidays) });
  }

  // Projection end: next income's shifted date plus one full cycle, else the horizon.
  const horizonEnd = addDays(currentDate, projectionHorizonDays);
  const incomeDates = candidates
    .filter((e) => inScope(e) && e.entryType === 'INCOME' && e.status !== 'SKIPPED')
    .map((e) => e.shiftedPostDate)
    .sort();
  const nextIncomeDate = incomeDates.find((d) => d > currentDate) ?? null;

  let projectionEndDate = horizonEnd;
  if (nextIncomeDate !== null) {
    const following = incomeDates.find((d) => d > nextIncomeDate);
    projectionEndDate =
      following !== undefined
        ? addDays(following, -1) // end of the cycle that starts at the next income
        : nextIncomeDate > horizonEnd
          ? nextIncomeDate
          : horizonEnd;
  }
  if (projectionEndDate < currentDate) {
    throw new Error(`Projection end ${projectionEndDate} is before start ${currentDate}`);
  }

  const entries = candidates
    .filter((e) => e.shiftedPostDate <= projectionEndDate)
    .sort(compareEntries);
  const scoped = entries.filter(inScope);

  const payCycles = computePayCycles(scoped, currentDate, projectionEndDate);
  const upcomingEntries = entries.filter((e) => e.shiftedPostDate >= currentDate);

  if (primary === undefined) {
    return {
      balances: [],
      runway: null,
      upcomingEntries,
      payCycles,
      warnings: buildWarnings({
        runway: null,
        thresholdCents: input.lowBalanceThresholdCents,
        entries,
        startDate: currentDate,
        startingLedgerCents: 0,
        startingAvailableCents: 0,
      }),
    };
  }

  // Commitments feed the balance projection only: never entries, cycles or warnings.
  const commitmentEntries: Entry[] = (input.envelopeCommitments ?? []).map((c) => ({
    id: `commitment:${c.envelopeId}`,
    accountId: primary.id,
    scheduleId: null,
    postDate: c.date,
    shiftedPostDate: c.date,
    estimatedAmountCents: -Math.abs(c.amountCents),
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'DEBIT',
    description: c.description,
  }));

  const balances = projectBalances(
    primary.ledgerBalanceCents,
    primary.availableBalanceCents,
    commitmentEntries.length > 0 ? [...scoped, ...commitmentEntries] : scoped,
    currentDate,
    projectionEndDate,
  );
  const runway = computeRunway(balances, nextIncomeDate, projectionEndDate);
  const warnings = buildWarnings({
    runway,
    thresholdCents: input.lowBalanceThresholdCents,
    entries: scoped,
    startDate: currentDate,
    startingLedgerCents: primary.ledgerBalanceCents,
    startingAvailableCents: primary.availableBalanceCents,
  });

  return { balances, runway, upcomingEntries, payCycles, warnings };
}
