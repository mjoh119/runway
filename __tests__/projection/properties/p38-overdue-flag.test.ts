import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { buildWarnings, findOverdueEntries } from '@/lib/projection/warnings';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 38: Overdue entry flagging
// **Validates: Requirements 12.2**

const START = '2025-03-15';

const entryArb = (id: number): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: -10, max: 10 }),
      status: fc.constantFrom('PLANNED', 'PENDING', 'POSTED', 'SKIPPED') as fc.Arbitrary<Entry['status']>,
      actual: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
      estimated: fc.integer({ min: 1, max: 100_000 }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
    })
    .map(({ offset, status, actual, estimated, entryType }) => {
      const date = addDays(START, offset);
      return {
        id: `e${id}`,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: estimated,
        actualAmountCents: actual,
        status,
        entryType,
      };
    });

const entriesArb = fc
  .integer({ min: 0, max: 15 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => entryArb(i))));

describe('Property 38: Overdue entry flagging', () => {
  it('flags exactly PLANNED, no-actual entries dated before start; omitted when none', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const expectedIds = entries
          .filter(
            (e) => e.status === 'PLANNED' && e.actualAmountCents === null && e.shiftedPostDate < START,
          )
          .map((e) => e.id);

        expect(findOverdueEntries(entries, START).map((e) => e.id)).toEqual(expectedIds);

        const warnings = buildWarnings({
          runway: null,
          thresholdCents: null,
          entries,
          startDate: START,
          startingLedgerCents: 0,
          startingAvailableCents: 0,
        });

        if (expectedIds.length === 0) {
          expect(warnings.overdueEntries).toBeUndefined();
        } else {
          expect(warnings.overdueEntries!.map((e) => e.id)).toEqual(expectedIds);
        }
      }),
      { numRuns: 100 },
    );
  });
});
