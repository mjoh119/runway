import { describe, it } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { computePayCycles } from '@/lib/projection/cycle';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 12: Pay cycle boundaries from income
// **Validates: Requirements 5.1, 5.5**

const BASE = '2025-01-01';

const scenarioArb = fc
  .record({
    currentOffset: fc.integer({ min: 0, max: 60 }),
    horizon: fc.integer({ min: 0, max: 120 }),
    // Distinct shifted income dates; some scheduled (scheduleId set), some one-off.
    incomes: fc.uniqueArray(
      fc.record({ offset: fc.integer({ min: -30, max: 200 }), scheduled: fc.boolean() }),
      { selector: (i) => i.offset, maxLength: 12 },
    ),
  })
  .map(({ currentOffset, horizon, incomes }) => {
    const currentDate = addDays(BASE, currentOffset);
    const endDate = addDays(currentDate, horizon);
    const entries: Entry[] = incomes.map((inc, idx) => {
      const date = addDays(BASE, inc.offset);
      return {
        id: `inc-${idx}`,
        accountId: 'a',
        scheduleId: inc.scheduled ? 's1' : null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: 100_000,
        actualAmountCents: null,
        status: 'PLANNED',
        entryType: 'INCOME',
      };
    });
    return { entries, currentDate, endDate };
  });

describe('Property 12: Pay cycle boundaries from income', () => {
  it('cycles are contiguous, start at income dates, and end at the day before the next income', () => {
    fc.assert(
      fc.property(scenarioArb, ({ entries, currentDate, endDate }) => {
        const cycles = computePayCycles(entries, currentDate, endDate);
        if (cycles.length === 0) return false;

        // Last cycle ends at projection end.
        if (cycles[cycles.length - 1].endDate !== endDate) return false;

        const byId = new Map(entries.map((e) => [e.id, e]));
        for (let i = 0; i < cycles.length; i++) {
          const c = cycles[i];
          if (c.startDate > c.endDate) return false;

          // Contiguity: next start = previous end + 1.
          if (i > 0 && c.startDate !== addDays(cycles[i - 1].endDate, 1)) return false;

          if (c.incomeEntryId === null) {
            // Only the first cycle may lack an income, and it starts at currentDate.
            if (i !== 0 || c.startDate !== currentDate) return false;
          } else {
            const inc = byId.get(c.incomeEntryId);
            if (!inc || inc.shiftedPostDate !== c.startDate) return false;
            // Only the first cycle may start before currentDate.
            if (i > 0 && c.startDate <= currentDate) return false;
          }
        }
        if (cycles[0].incomeEntryId === null && cycles[0].startDate !== currentDate) return false;

        // Every income inside (currentDate, endDate] starts a cycle, ending the previous one a day before.
        const starts = new Set(cycles.map((c) => c.startDate));
        for (const e of entries) {
          const d = e.shiftedPostDate;
          if (d > currentDate && d <= endDate && !starts.has(d)) return false;
        }
        for (let i = 0; i + 1 < cycles.length; i++) {
          if (cycles[i].endDate !== addDays(cycles[i + 1].startDate, -1)) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
