import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { collectScheduledIncomeDates } from '../../src/lib/envelopes/income-dates';
import { generateEntries } from '../../src/lib/projection/engine';
import { shiftDate } from '../../src/lib/projection/shift';
import type { Entry, Schedule } from '../../src/lib/projection/types';

const DAY_MS = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

const FROM = '2026-01-01';
const TO = '2026-12-31';

const dateIn2026 = fc
  .integer({ min: utcMs('2026-01-01') / DAY_MS, max: utcMs('2026-12-31') / DAY_MS })
  .map((days) => toIso(days * DAY_MS));

const holidays = fc.array(dateIn2026, { maxLength: 8 });

const incomeSchedule = (startDate: string, intervalDays: number, entryType: 'INCOME' | 'DEBIT' = 'INCOME'): Schedule => ({
  id: 'sched-1',
  name: 'Schedule',
  accountId: 'acc-1',
  intervalType: 'DAYS',
  intervalValue: intervalDays,
  daysOfMonth: [],
  startDate,
  estimatedAmountCents: 100_000,
  entryType,
});

const record = (
  over: Partial<Entry> & Pick<Entry, 'postDate' | 'status' | 'entryType'>,
): Entry => ({
  id: `rec-${over.postDate}-${over.status}`,
  accountId: 'acc-1',
  scheduleId: 'sched-1',
  shiftedPostDate: over.postDate,
  estimatedAmountCents: 100_000,
  actualAmountCents: over.status === 'POSTED' ? 100_000 : null,
  ...over,
});

// Intervals of 7+ days keep shifted dates distinct for a single schedule.
const scheduleArb = fc.record({
  start: dateIn2026,
  interval: fc.integer({ min: 7, max: 45 }),
});

describe('collectScheduledIncomeDates', () => {
  it('Property 17: output is sorted and unique, and debit schedules contribute nothing', () => {
    // **Validates: Requirements 5.4, 7.9, 7.10**
    fc.assert(
      fc.property(scheduleArb, holidays, ({ start, interval }, hols) => {
        const debitOnly = collectScheduledIncomeDates({
          schedules: [incomeSchedule(start, interval, 'DEBIT')],
          occurrenceRecords: [],
          holidays: hols,
          from: FROM,
          to: TO,
        });
        expect(debitOnly).toEqual([]);

        const dates = collectScheduledIncomeDates({
          schedules: [incomeSchedule(start, interval)],
          occurrenceRecords: [],
          holidays: hols,
          from: FROM,
          to: TO,
        });
        expect(dates).toEqual([...new Set(dates)].sort());
      }),
      { numRuns: 100 },
    );
  });

  it('Property 17: a SKIPPED occurrence is dropped and everything else is kept', () => {
    // **Validates: Requirements 5.4, 7.9, 7.10**
    fc.assert(
      fc.property(scheduleArb, holidays, fc.nat(), ({ start, interval }, hols, pick) => {
        const schedule = incomeSchedule(start, interval);
        const base = { schedules: [schedule], holidays: hols, from: FROM, to: TO };
        const baseline = collectScheduledIncomeDates({ ...base, occurrenceRecords: [] });
        const occurrences = generateEntries(schedule, FROM, TO, hols);
        fc.pre(occurrences.length > 0);

        const skipped = occurrences[pick % occurrences.length];
        const dates = collectScheduledIncomeDates({
          ...base,
          occurrenceRecords: [
            record({ postDate: skipped.postDate, status: 'SKIPPED', entryType: 'INCOME' }),
          ],
        });

        expect(dates).not.toContain(skipped.shiftedPostDate);
        expect(dates).toEqual(baseline.filter((d) => d !== skipped.shiftedPostDate));
      }),
      { numRuns: 100 },
    );
  });

  it('Property 17: a POSTED income record is kept at its shifted original post date', () => {
    // **Validates: Requirements 5.4, 7.9, 7.10**
    fc.assert(
      fc.property(dateIn2026, holidays, (postDate, hols) => {
        // No schedules: the only source is the posted record itself.
        const dates = collectScheduledIncomeDates({
          schedules: [],
          occurrenceRecords: [
            record({
              postDate,
              status: 'POSTED',
              entryType: 'INCOME',
              actualDate: toIso(utcMs(postDate) + 3 * DAY_MS),
            }),
          ],
          holidays: hols,
          from: FROM,
          to: TO,
        });
        expect(dates).toEqual([shiftDate(postDate, 'INCOME', hols)]);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 17: POSTED debit records and SKIPPED income records never produce dates', () => {
    // **Validates: Requirements 5.4, 7.9, 7.10**
    fc.assert(
      fc.property(dateIn2026, holidays, (postDate, hols) => {
        const dates = collectScheduledIncomeDates({
          schedules: [],
          occurrenceRecords: [
            record({ postDate, status: 'POSTED', entryType: 'DEBIT' }),
            record({ postDate, status: 'SKIPPED', entryType: 'INCOME' }),
          ],
          holidays: hols,
          from: FROM,
          to: TO,
        });
        expect(dates).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('keeps a posted occurrence of a schedule exactly once', () => {
    const schedule = incomeSchedule('2026-03-06', 14);
    const dates = collectScheduledIncomeDates({
      schedules: [schedule],
      occurrenceRecords: [record({ postDate: '2026-03-06', status: 'POSTED', entryType: 'INCOME' })],
      holidays: [],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(dates).toEqual(['2026-03-06', '2026-03-20']);
  });
});
