import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { computePayCycles } from '@/lib/projection/cycle';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 14: Mid-cycle income splits cycle
// **Validates: Requirements 5.4**

const BASE = '2025-01-01';

function income(id: string, date: string, scheduled: boolean): Entry {
  return {
    id,
    accountId: 'a',
    scheduleId: scheduled ? 's1' : null,
    postDate: date,
    shiftedPostDate: date,
    estimatedAmountCents: 100_000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'INCOME',
  };
}

const scenarioArb = fc.record({
  currentOffset: fc.integer({ min: 0, max: 60 }),
  horizon: fc.integer({ min: 1, max: 120 }),
  incomes: fc.uniqueArray(
    fc.record({ offset: fc.integer({ min: -30, max: 200 }), scheduled: fc.boolean() }),
    { selector: (i) => i.offset, maxLength: 12 },
  ),
  cyclePick: fc.nat({ max: 1000 }),
  dayPick: fc.nat({ max: 1000 }),
});

describe('Property 14: Mid-cycle income splits cycle', () => {
  it('a one-off income inside a cycle ends the previous cycle at d-1 and starts a new one at d', () => {
    fc.assert(
      fc.property(scenarioArb, ({ currentOffset, horizon, incomes, cyclePick, dayPick }) => {
        const currentDate = addDays(BASE, currentOffset);
        const endDate = addDays(currentDate, horizon);
        const base = incomes.map((inc, i) => income(`inc-${i}`, addDays(BASE, inc.offset), inc.scheduled));

        const before = computePayCycles(base, currentDate, endDate);

        // The first cycle may start before currentDate (past income). Income dated on or before
        // currentDate just replaces that start rather than splitting, so the splittable window
        // is (max(s, currentDate), e].
        const lower = (c: { startDate: string }) => (c.startDate > currentDate ? c.startDate : currentDate);
        const splittable = before.map((c, i) => ({ c, i })).filter(({ c }) => c.endDate > lower(c));
        fc.pre(splittable.length > 0);

        const { c: target, i: idx } = splittable[cyclePick % splittable.length];
        const days = daysBetween(lower(target), target.endDate); // >= 1
        const d = addDays(lower(target), 1 + (dayPick % days)); // s < d <= e, d > currentDate

        const oneOff = income('one-off', d, false);
        const after = computePayCycles([...base, oneOff], currentDate, endDate);

        const expected = [
          ...before.slice(0, idx),
          { startDate: target.startDate, endDate: addDays(d, -1), incomeEntryId: target.incomeEntryId },
          { startDate: d, endDate: target.endDate, incomeEntryId: 'one-off' },
          ...before.slice(idx + 1),
        ];
        expect(after).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}
