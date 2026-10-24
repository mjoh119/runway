import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { generateEntries, projectCashFlow } from '@/lib/projection/engine';
import { shiftDate } from '@/lib/projection/shift';
import type { Entry, Schedule } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 39: Upcoming entries ordering
// **Validates: Requirements 13.3**

const BASE = '2025-01-01';
const WIDE_SPAN = 800; // matches the engine's generation window

const scheduleArb = fc.record({
  every: fc.integer({ min: 1, max: 45 }),
  startOffset: fc.integer({ min: -20, max: 60 }),
  amount: fc.integer({ min: 1, max: 100_000 }),
  entryType: fc.constantFrom<'DEBIT' | 'INCOME'>('DEBIT', 'INCOME'),
});

const oneOffArb = fc.record({
  postOffset: fc.integer({ min: -15, max: 120 }),
  amount: fc.integer({ min: 1, max: 100_000 }),
  entryType: fc.constantFrom<'DEBIT' | 'INCOME'>('DEBIT', 'INCOME'),
});

const holidaysArb = fc.array(
  fc.integer({ min: 0, max: 400 }).map((o) => addDays(BASE, o)),
  { maxLength: 10 },
);

const inputArb = fc.record({
  dayOffset: fc.integer({ min: 0, max: 700 }),
  horizon: fc.integer({ min: 1, max: 365 }),
  schedules: fc.array(scheduleArb, { maxLength: 4 }),
  oneOffs: fc.array(oneOffArb, { maxLength: 6 }),
  holidays: holidaysArb,
});

describe('Property 39: Upcoming entries ordering', () => {
  it('upcomingEntries are on/after currentDate, sorted ascending, and lose nothing in the window', () => {
    fc.assert(
      fc.property(inputArb, (p) => {
        const currentDate = addDays(BASE, p.dayOffset);

        const schedules: Schedule[] = p.schedules.map((s, i) => ({
          id: `sched-${i}`,
          name: `Schedule ${i}`,
          accountId: 'acc',
          intervalType: 'DAYS',
          intervalValue: s.every,
          daysOfMonth: [],
          startDate: addDays(currentDate, s.startOffset),
          estimatedAmountCents: s.amount,
          entryType: s.entryType,
        }));

        const oneOffEntries: Entry[] = p.oneOffs.map((o, i) => {
          const postDate = addDays(currentDate, o.postOffset);
          return {
            id: `oneoff-${i}`,
            accountId: 'acc',
            scheduleId: null,
            postDate,
            shiftedPostDate: postDate,
            estimatedAmountCents: o.amount,
            actualAmountCents: null,
            status: 'PLANNED',
            entryType: o.entryType,
          };
        });

        const out = projectCashFlow({
          accounts: [
            { id: 'acc', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 100_000 },
          ],
          schedules,
          oneOffEntries,
          holidays: p.holidays,
          currentDate,
          projectionHorizonDays: p.horizon,
        });

        // Filter and ordering
        const dates = out.upcomingEntries.map((e) => e.shiftedPostDate);
        for (const d of dates) expect(d >= currentDate).toBe(true);
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1] <= dates[i]).toBe(true);
        }

        // No loss: every candidate on/after currentDate within the window is present
        const windowEnd = out.runway!.projectionEndDate;
        const wideEnd = addDays(currentDate, WIDE_SPAN);
        const candidates: Entry[] = [
          ...schedules.flatMap((s) => generateEntries(s, currentDate, wideEnd, p.holidays)),
          ...oneOffEntries.map((e) => ({
            ...e,
            shiftedPostDate: shiftDate(e.postDate, e.entryType, p.holidays),
          })),
        ];
        const expectedIds = candidates
          .filter((e) => e.shiftedPostDate >= currentDate && e.shiftedPostDate <= windowEnd)
          .map((e) => e.id)
          .sort();
        const actualIds = out.upcomingEntries.map((e) => e.id).sort();
        expect(actualIds).toEqual(expectedIds);
      }),
      { numRuns: 100 },
    );
  });
});
