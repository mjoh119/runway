import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectCashFlow } from '@/lib/projection/engine';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 20: Hold date estimation labeled
// **Validates: Requirements 6.9**

const START = '2025-03-15';

const entryArb = fc.record({
  postOffset: fc.integer({ min: -10, max: 20 }),
  holdOffset: fc.integer({ min: -5, max: 30 }),
  amount: fc.integer({ min: 1, max: 1_000_000 }),
  isHoldEstimated: fc.constantFrom<boolean | undefined>(true, false, undefined),
});

describe('Property 20: Hold date estimation labeled', () => {
  it('preserves isHoldEstimated and the unshifted holdReleaseDate on output entries', () => {
    fc.assert(
      fc.property(entryArb, ({ postOffset, holdOffset, amount, isHoldEstimated }) => {
        const holdReleaseDate = addDays(START, holdOffset);
        const postDate = addDays(START, postOffset);
        const entry: Entry = {
          id: 'hold-1',
          accountId: 'a1',
          scheduleId: null,
          postDate,
          shiftedPostDate: postDate,
          estimatedAmountCents: amount,
          actualAmountCents: null,
          status: 'PLANNED',
          entryType: 'INCOME',
          holdReleaseDate,
          ...(isHoldEstimated === undefined ? {} : { isHoldEstimated }),
        };

        const out = projectCashFlow({
          accounts: [
            { id: 'a1', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 100_000 },
          ],
          schedules: [],
          oneOffEntries: [entry],
          holidays: [],
          currentDate: START,
          projectionHorizonDays: 30,
        });

        // The entry surfaces in upcoming entries or in the overdue warning.
        const carriers = [
          ...out.upcomingEntries,
          ...(out.warnings.overdueEntries ?? []),
        ].filter((e) => e.id === entry.id);
        expect(carriers.length).toBeGreaterThan(0);

        for (const e of carriers) {
          expect(e.holdReleaseDate).toBe(holdReleaseDate);
          if (isHoldEstimated === true) {
            expect(e.isHoldEstimated).toBe(true);
          } else {
            expect(e.isHoldEstimated).not.toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
