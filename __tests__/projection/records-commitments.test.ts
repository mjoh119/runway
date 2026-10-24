import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { postingBalanceDelta } from '@/lib/entry-service/balance-delta';
import { buildEnvelopeCommitments } from '@/lib/envelopes/commitments';
import { computeEnvelopeTotals } from '@/lib/envelopes/totals';
import { buildEnvelopeCardView } from '@/lib/envelopes/view-model';
import type { LineItemLike, ResetPeriod } from '@/lib/envelopes/types';
import { addDays } from '@/lib/projection/dates';
import { projectCashFlow } from '@/lib/projection/engine';
import { computeCumulativeVariance } from '@/lib/projection/variance';
import { findOverdueEntries } from '@/lib/projection/warnings';
import type { Entry, ProjectionInput, Schedule } from '@/lib/projection/types';

// ---------------------------------------------------------------------------
// Shared helpers (tasks 5.3 to 5.9 append to this file and reuse this section)
// ---------------------------------------------------------------------------

export const TODAY = '2025-03-15';

export const accountsArb = fc
  .record({
    ledger: fc.integer({ min: -500_000, max: 2_000_000 }),
    available: fc.option(fc.integer({ min: -500_000, max: 2_000_000 }), { nil: null }),
  })
  .map(({ ledger, available }) => [
    { id: 'a1', isPrimary: true, ledgerBalanceCents: ledger, availableBalanceCents: available },
  ]);

export const scheduleArb = (id: string): fc.Arbitrary<Schedule> =>
  fc
    .record({
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Schedule['entryType']>,
      amount: fc.integer({ min: 1, max: 300_000 }),
      startOffset: fc.integer({ min: -60, max: 20 }),
      kind: fc.constantFrom('DAYS', 'WEEKS', 'MONTHS', 'DAYS_OF_MONTH') as fc.Arbitrary<
        Schedule['intervalType']
      >,
      value: fc.integer({ min: 1, max: 4 }),
      days: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { minLength: 1, maxLength: 2 }),
    })
    .map(({ entryType, amount, startOffset, kind, value, days }) => ({
      id,
      name: id,
      accountId: 'a1',
      intervalType: kind,
      intervalValue: kind === 'DAYS_OF_MONTH' ? 1 : value,
      daysOfMonth: kind === 'DAYS_OF_MONTH' ? days : [],
      startDate: addDays(TODAY, startOffset),
      estimatedAmountCents: amount,
      entryType,
    }));

export const oneOffArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: -10, max: 40 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      status: fc.constantFrom('PLANNED', 'PENDING', 'POSTED', 'SKIPPED') as fc.Arbitrary<
        Entry['status']
      >,
    })
    .map(({ offset, amount, entryType, status }) => {
      const date = addDays(TODAY, offset);
      return {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: status === 'POSTED' ? amount : null,
        status,
        entryType,
      };
    });

export const baseInputArb: fc.Arbitrary<ProjectionInput> = fc
  .record({
    accounts: accountsArb,
    schedules: fc.tuple(scheduleArb('s0'), scheduleArb('s1')).chain(([a, b]) =>
      fc.constantFrom([a], [a, b], [] as Schedule[]),
    ),
    oneOffs: fc.tuple(oneOffArb('o0'), oneOffArb('o1')).chain(([a, b]) =>
      fc.constantFrom([a], [a, b], [] as Entry[]),
    ),
    holidays: fc.uniqueArray(
      fc.integer({ min: 0, max: 60 }).map((n) => addDays(TODAY, n)),
      { maxLength: 4 },
    ),
    horizon: fc.integer({ min: 1, max: 90 }),
    threshold: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: undefined }),
  })
  .map(({ accounts, schedules, oneOffs, holidays, horizon, threshold }) => ({
    accounts,
    schedules,
    oneOffEntries: oneOffs,
    holidays,
    currentDate: TODAY,
    projectionHorizonDays: horizon,
    lowBalanceThresholdCents: threshold,
  }));

// ---------------------------------------------------------------------------
// Property 23: Absent new inputs reproduce Spec 1 output
// ---------------------------------------------------------------------------

// Feature: plan-vs-actual-envelopes, Property 23: Absent new inputs reproduce Spec 1 output
// **Validates: Requirements 9.9**
describe('Property 23: Absent new inputs reproduce Spec 1 output', () => {
  it('omitted, undefined, and empty occurrenceRecords/envelopeCommitments give identical output', () => {
    fc.assert(
      fc.property(baseInputArb, (input) => {
        const omitted = projectCashFlow(input);
        const undef = projectCashFlow({
          ...input,
          occurrenceRecords: undefined,
          envelopeCommitments: undefined,
        });
        const empty = projectCashFlow({
          ...input,
          occurrenceRecords: [],
          envelopeCommitments: [],
        });
        expect(undef).toEqual(omitted);
        expect(empty).toEqual(omitted);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8 (engine part): Occurrence records replace generated occurrences
// ---------------------------------------------------------------------------

const recordFor = (
  base: Entry,
  status: Entry['status'],
  actual: number,
): Entry => ({
  id: base.id,
  accountId: base.accountId,
  scheduleId: base.scheduleId,
  postDate: base.postDate,
  shiftedPostDate: base.postDate, // engine recomputes this
  estimatedAmountCents: base.estimatedAmountCents,
  actualAmountCents: status === 'POSTED' ? actual : null,
  status,
  entryType: base.entryType,
  description: base.description,
  actualDate: status === 'POSTED' ? base.postDate : undefined,
});

// Feature: plan-vs-actual-envelopes, Property 8: Occurrence records replace generated occurrences
// **Validates: Requirements 2.6, 2.10**
describe('Property 8: Occurrence records replace generated occurrences (engine part)', () => {
  it('a record replaces exactly its generated occurrence, once, with the record status and amounts', () => {
    fc.assert(
      fc.property(
        baseInputArb,
        fc.nat(),
        fc.constantFrom('POSTED', 'SKIPPED', 'PENDING') as fc.Arbitrary<Entry['status']>,
        fc.integer({ min: 1, max: 400_000 }),
        (input, pick, status, actual) => {
          const baseline = projectCashFlow(input);
          const targets = baseline.upcomingEntries.filter((e) => e.scheduleId !== null);
          fc.pre(targets.length > 0);
          const target = targets[pick % targets.length];

          const record = recordFor(target, status, actual);
          const out = projectCashFlow({ ...input, occurrenceRecords: [record] });

          const matches = out.upcomingEntries.filter((e) => e.id === target.id);
          // Exactly one entry for the occurrence: no duplicate from generation.
          expect(matches).toHaveLength(1);
          expect(matches[0].status).toBe(status);
          expect(matches[0].actualAmountCents).toBe(record.actualAmountCents);
          expect(matches[0].estimatedAmountCents).toBe(target.estimatedAmountCents);
          // Shifted date still comes from the original post date (Req 2.10).
          expect(matches[0].shiftedPostDate).toBe(target.shiftedPostDate);

          // Other schedule occurrences are untouched by the record.
          const others = (es: Entry[]) =>
            es.filter((e) => e.scheduleId !== null && e.id !== target.id).map((e) => e.id);
          if (status !== 'SKIPPED' || target.entryType !== 'INCOME') {
            expect(others(out.upcomingEntries)).toEqual(others(baseline.upcomingEntries));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a POSTED scheduled income record stays a pay-cycle boundary at its shifted date', () => {
    fc.assert(
      fc.property(
        scheduleArb('s0'),
        fc.nat(),
        fc.integer({ min: 1, max: 400_000 }),
        fc.integer({ min: 30, max: 120 }),
        (sched, pick, actual, horizon) => {
          const schedule: Schedule = { ...sched, entryType: 'INCOME' };
          const input: ProjectionInput = {
            accounts: [
              { id: 'a1', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 100_000 },
            ],
            schedules: [schedule],
            oneOffEntries: [],
            holidays: [],
            currentDate: TODAY,
            projectionHorizonDays: horizon,
          };
          const baseline = projectCashFlow(input);
          const incomes = baseline.upcomingEntries.filter((e) => e.scheduleId === 's0');
          // Only targets whose shifted date no other income shares (no tie-break absorption).
          const unique = incomes.filter(
            (e) => incomes.filter((o) => o.shiftedPostDate === e.shiftedPostDate).length === 1,
          );
          fc.pre(unique.length > 0);
          const target = unique[pick % unique.length];

          const out = projectCashFlow({
            ...input,
            occurrenceRecords: [recordFor(target, 'POSTED', actual)],
          });
          const cycle = out.payCycles.find((c) => c.startDate === target.shiftedPostDate);
          expect(cycle).toBeDefined();
          expect(cycle!.incomeEntryId).toBe(target.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: POSTED Saturday income starts a cycle on the preceding Friday', () => {
    const input: ProjectionInput = {
      accounts: [
        { id: 'a1', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 100_000 },
      ],
      schedules: [
        {
          id: 's0',
          name: 'Pay',
          accountId: 'a1',
          intervalType: 'WEEKS',
          intervalValue: 2,
          daysOfMonth: [],
          startDate: '2025-03-22', // Saturday
          estimatedAmountCents: 200_000,
          entryType: 'INCOME',
        },
      ],
      oneOffEntries: [],
      holidays: [],
      currentDate: TODAY,
      projectionHorizonDays: 60,
      occurrenceRecords: [
        {
          id: 's0:2025-03-22',
          accountId: 'a1',
          scheduleId: 's0',
          postDate: '2025-03-22',
          shiftedPostDate: '2025-03-22',
          estimatedAmountCents: 200_000,
          actualAmountCents: 195_000,
          status: 'POSTED',
          entryType: 'INCOME',
          actualDate: '2025-03-21',
        },
      ],
    };
    const out = projectCashFlow(input);
    expect(out.payCycles.map((c) => c.startDate)).toContain('2025-03-21');
    expect(out.payCycles.find((c) => c.startDate === '2025-03-21')?.incomeEntryId).toBe(
      's0:2025-03-22',
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Skipped entries are inert
// ---------------------------------------------------------------------------

const skippedArb = (id: string): fc.Arbitrary<{ oneOff: Entry; record: Entry }> =>
  fc
    .record({
      offset: fc.integer({ min: -30, max: 60 }),
      amount: fc.integer({ min: 1, max: 400_000 }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
    })
    .map(({ offset, amount, entryType }) => {
      const date = addDays(TODAY, offset);
      const oneOff: Entry = {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: null,
        status: 'SKIPPED',
        entryType,
      };
      // Occurrence record of a schedule that is not in the input, so it
      // cannot replace any generated occurrence.
      const record: Entry = { ...oneOff, id: `skipped-sched:${date}`, scheduleId: 'skipped-sched' };
      return { oneOff, record };
    });

// Feature: plan-vs-actual-envelopes, Property 9: Skipped entries are inert
// **Validates: Requirements 4.3, 4.5**
describe('Property 9: Skipped entries are inert', () => {
  const observable = (input: ProjectionInput) => {
    const out = projectCashFlow(input);
    const cycle = out.payCycles[0] ?? {
      startDate: TODAY,
      endDate: addDays(TODAY, input.projectionHorizonDays),
    };
    return {
      balances: out.balances,
      runway: out.runway,
      payCycles: out.payCycles,
      warnings: out.warnings,
      variance: computeCumulativeVariance(out.upcomingEntries, cycle),
      // Everything except the skipped entries themselves.
      activeEntries: out.upcomingEntries.filter((e) => e.status !== 'SKIPPED'),
    };
  };

  it('adding a SKIPPED one-off entry changes no balance, runway, cycle, warning, or variance', () => {
    fc.assert(
      fc.property(baseInputArb, skippedArb('skipped-one-off'), (input, { oneOff }) => {
        const before = observable(input);
        const after = observable({
          ...input,
          oneOffEntries: [...input.oneOffEntries, oneOff],
        });
        expect(after).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('adding a SKIPPED occurrence record changes no balance, runway, cycle, warning, or variance', () => {
    fc.assert(
      fc.property(baseInputArb, skippedArb('unused'), (input, { record }) => {
        const before = observable(input);
        const after = observable({
          ...input,
          occurrenceRecords: [...(input.occurrenceRecords ?? []), record],
        });
        expect(after).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('example: a SKIPPED past-due debit raises no overdue warning', () => {
    const skipped: Entry = {
      id: 'o-skip',
      accountId: 'a1',
      scheduleId: null,
      postDate: addDays(TODAY, -3),
      shiftedPostDate: addDays(TODAY, -3),
      estimatedAmountCents: 5_000,
      actualAmountCents: null,
      status: 'SKIPPED',
      entryType: 'DEBIT',
    };
    const out = projectCashFlow({
      accounts: [
        { id: 'a1', isPrimary: true, ledgerBalanceCents: 10_000, availableBalanceCents: 10_000 },
      ],
      schedules: [],
      oneOffEntries: [skipped],
      holidays: [],
      currentDate: TODAY,
      projectionHorizonDays: 30,
    });
    expect(out.warnings.overdueEntries ?? []).toHaveLength(0);
    expect(out.runway?.lowestBalanceCents).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Property 11: Only PLANNED entries can be overdue
// ---------------------------------------------------------------------------

const entryArb = (id: string): fc.Arbitrary<Entry> =>
  fc
    .record({
      offset: fc.integer({ min: -40, max: 40 }),
      amount: fc.integer({ min: 1, max: 100_000 }),
      entryType: fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
      status: fc.constantFrom('PLANNED', 'PENDING', 'POSTED', 'SKIPPED') as fc.Arbitrary<
        Entry['status']
      >,
      hasActual: fc.boolean(),
    })
    .map(({ offset, amount, entryType, status, hasActual }) => {
      const date = addDays(TODAY, offset);
      return {
        id,
        accountId: 'a1',
        scheduleId: null,
        postDate: date,
        shiftedPostDate: date,
        estimatedAmountCents: amount,
        actualAmountCents: status === 'POSTED' || hasActual ? amount : null,
        status,
        entryType,
      };
    });

const entriesArb = fc
  .array(fc.nat({ max: 1000 }), { minLength: 0, maxLength: 8 })
  .chain((ns) => fc.tuple(...ns.map((n, i) => entryArb(`e${i}-${n}`))));

// Feature: plan-vs-actual-envelopes, Property 11: Only PLANNED entries can be overdue
// **Validates: Requirements 2.9, 5.9, 5.13, 16.6**
describe('Property 11: Only PLANNED entries can be overdue', () => {
  it('findOverdueEntries returns exactly the PLANNED, actual-less entries dated before the start', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const overdue = findOverdueEntries(entries, TODAY);
        for (const e of overdue) {
          expect(e.status).toBe('PLANNED');
          expect(e.actualAmountCents).toBeNull();
          expect(e.shiftedPostDate < TODAY).toBe(true);
        }
        const expected = entries.filter(
          (e) => e.status === 'PLANNED' && e.actualAmountCents === null && e.shiftedPostDate < TODAY,
        );
        expect(overdue).toEqual(expected);
        // POSTED / SKIPPED / PENDING are never overdue.
        expect(overdue.some((e) => e.status !== 'PLANNED')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('projectCashFlow never reports a POSTED, SKIPPED, or PENDING past entry as overdue', () => {
    fc.assert(
      fc.property(
        baseInputArb,
        fc.constantFrom('POSTED', 'SKIPPED', 'PENDING') as fc.Arbitrary<Entry['status']>,
        fc.integer({ min: 5, max: 30 }),
        fc.constantFrom('DEBIT', 'INCOME') as fc.Arbitrary<Entry['entryType']>,
        (input, status, daysAgo, entryType) => {
          const date = addDays(TODAY, -daysAgo);
          const pastOneOff: Entry = {
            id: 'past-one-off',
            accountId: 'a1',
            scheduleId: null,
            postDate: date,
            shiftedPostDate: date,
            estimatedAmountCents: 7_000,
            actualAmountCents: status === 'POSTED' ? 7_000 : null,
            status,
            entryType,
            actualDate: status === 'POSTED' ? date : undefined,
          };
          const out = projectCashFlow({
            ...input,
            oneOffEntries: [...input.oneOffEntries, pastOneOff],
          });
          const overdue = out.warnings.overdueEntries ?? [];
          expect(overdue.some((e) => e.id === 'past-one-off')).toBe(false);
          for (const e of overdue) {
            expect(e.status).toBe('PLANNED');
            expect(e.actualAmountCents).toBeNull();
            expect(e.shiftedPostDate < TODAY).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: a PLANNED past debit is overdue, the same entry POSTED is not', () => {
    const base: Entry = {
      id: 'o1',
      accountId: 'a1',
      scheduleId: null,
      postDate: addDays(TODAY, -10),
      shiftedPostDate: addDays(TODAY, -10),
      estimatedAmountCents: 5_000,
      actualAmountCents: null,
      status: 'PLANNED',
      entryType: 'DEBIT',
    };
    const run = (e: Entry) =>
      projectCashFlow({
        accounts: [
          { id: 'a1', isPrimary: true, ledgerBalanceCents: 10_000, availableBalanceCents: 10_000 },
        ],
        schedules: [],
        oneOffEntries: [e],
        holidays: [],
        currentDate: TODAY,
        projectionHorizonDays: 30,
      }).warnings.overdueEntries ?? [];
    expect(run(base).map((e) => e.id)).toEqual(['o1']);
    expect(run({ ...base, status: 'POSTED', actualAmountCents: 5_000 })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property 21: Commitments reduce both projected balances without shifting
// ---------------------------------------------------------------------------

// Feature: plan-vs-actual-envelopes, Property 21: Commitments reduce both projected balances without shifting
// **Validates: Requirements 9.3**
describe('Property 21: Commitments reduce both projected balances without shifting', () => {
  const MARKER = 'ZZ-commitment-marker';

  it('lowers both balances by L from date d onward, leaves earlier balances alone, and stays out of entries, cycles, and warnings', () => {
    fc.assert(
      fc.property(
        baseInputArb,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 500_000 }),
        fc.boolean(),
        (base, dayOffset, amount, makeHoliday) => {
          const date = addDays(TODAY, dayOffset);
          // Weekdays, weekends, and holidays all occur: offsets span whole weeks,
          // and half the runs also mark the commitment date as a bank holiday.
          const input: ProjectionInput = {
            ...base,
            holidays: makeHoliday ? [...new Set([...base.holidays, date])] : base.holidays,
          };
          const without = projectCashFlow(input);
          const withC = projectCashFlow({
            ...input,
            envelopeCommitments: [
              { envelopeId: 'env-p21', description: MARKER, amountCents: amount, date },
            ],
          });

          // Same dates; commitments never move the projection window.
          expect(withC.balances.map((b) => b.date)).toEqual(without.balances.map((b) => b.date));
          withC.balances.forEach((b, i) => {
            const b0 = without.balances[i];
            const delta = b.date >= date ? amount : 0;
            expect(b.ledgerBalanceCents).toBe(b0.ledgerBalanceCents - delta);
            expect(b.availableBalanceCents).toBe(b0.availableBalanceCents - delta);
          });

          // Never a timeline item, cycle input, or warning source.
          expect(withC.upcomingEntries).toEqual(without.upcomingEntries);
          expect(withC.payCycles).toEqual(without.payCycles);
          expect(withC.warnings.overdueEntries).toEqual(without.warnings.overdueEntries);
          expect(withC.warnings.availableBalanceDifference).toEqual(
            without.warnings.availableBalanceDifference,
          );
          expect(JSON.stringify(withC.upcomingEntries)).not.toContain('commitment:');
          expect(JSON.stringify(withC.payCycles)).not.toContain('commitment:');
          expect(JSON.stringify(withC.warnings)).not.toContain('commitment:');
          expect(JSON.stringify(withC.warnings)).not.toContain(MARKER);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: a commitment on a Saturday holiday applies on that exact date', () => {
    const date = '2025-03-22'; // Saturday
    const input: ProjectionInput = {
      accounts: [
        { id: 'a1', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 90_000 },
      ],
      schedules: [],
      oneOffEntries: [],
      holidays: [date],
      currentDate: TODAY,
      projectionHorizonDays: 30,
    };
    const without = projectCashFlow(input);
    const withC = projectCashFlow({
      ...input,
      envelopeCommitments: [{ envelopeId: 'e', description: 'Groceries', amountCents: 25_000, date }],
    });
    const at = (o: typeof without, d: string) => o.balances.find((b) => b.date === d)!;
    expect(at(withC, addDays(date, -1)).availableBalanceCents).toBe(
      at(without, addDays(date, -1)).availableBalanceCents,
    );
    expect(at(withC, date).ledgerBalanceCents).toBe(at(without, date).ledgerBalanceCents - 25_000);
    expect(at(withC, date).availableBalanceCents).toBe(
      at(without, date).availableBalanceCents - 25_000,
    );
    expect(withC.upcomingEntries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 5.7: Posting a due bill at its estimate leaves the projection unchanged
// (reusable helper for the Property 7 test in task 5.8)
// ---------------------------------------------------------------------------

/**
 * Posts the given generated occurrence at its estimate, dated today: balances
 * move by `postingBalanceDelta` (available only when non-null) and the
 * occurrence is replaced by a POSTED occurrence record.
 */
export function postDueEntryAtEstimate(input: ProjectionInput, target: Entry): ProjectionInput {
  const amount = Math.abs(target.estimatedAmountCents);
  const delta = postingBalanceDelta({
    direction: target.entryType,
    status: 'PLANNED',
    estimateMagnitudeCents: amount,
    actualMagnitudeCents: amount,
    actualDate: input.currentDate,
  });
  return {
    ...input,
    accounts: input.accounts.map((a) =>
      a.isPrimary
        ? {
            ...a,
            ledgerBalanceCents: a.ledgerBalanceCents + delta.ledgerCents,
            availableBalanceCents:
              a.availableBalanceCents === null
                ? null
                : a.availableBalanceCents + delta.availableCents,
          }
        : a,
    ),
    occurrenceRecords: [
      ...(input.occurrenceRecords ?? []),
      {
        ...target,
        actualAmountCents: target.estimatedAmountCents,
        status: 'POSTED',
        actualDate: input.currentDate,
      },
    ],
  };
}

// Feature: plan-vs-actual-envelopes, Task 5.7: runway does not jump when a planned bill is posted at its estimate
// **Validates: Requirements 3.7, 3.8**
describe('Posting a due planned bill at its estimate leaves runway unchanged', () => {
  it('example: runway lowest balance, runway date, and daily balances are identical', () => {
    const today = '2025-03-14'; // Friday
    const input: ProjectionInput = {
      accounts: [
        { id: 'a1', isPrimary: true, ledgerBalanceCents: 150_000, availableBalanceCents: 140_000 },
      ],
      schedules: [
        {
          id: 'rent',
          name: 'Rent',
          accountId: 'a1',
          intervalType: 'MONTHS',
          intervalValue: 1,
          daysOfMonth: [],
          startDate: today,
          estimatedAmountCents: 90_000,
          entryType: 'DEBIT',
        },
        {
          id: 'pay',
          name: 'Pay',
          accountId: 'a1',
          intervalType: 'WEEKS',
          intervalValue: 2,
          daysOfMonth: [],
          startDate: addDays(today, 7),
          estimatedAmountCents: 200_000,
          entryType: 'INCOME',
        },
        {
          id: 'phone',
          name: 'Phone',
          accountId: 'a1',
          intervalType: 'MONTHS',
          intervalValue: 1,
          daysOfMonth: [],
          startDate: addDays(today, 10),
          estimatedAmountCents: 6_000,
          entryType: 'DEBIT',
        },
      ],
      oneOffEntries: [],
      holidays: [],
      currentDate: today,
      projectionHorizonDays: 45,
    };

    const before = projectCashFlow(input);
    const target = before.upcomingEntries.find(
      (e) => e.scheduleId === 'rent' && e.shiftedPostDate === today && e.status === 'PLANNED',
    );
    expect(target).toBeDefined();

    const after = projectCashFlow(postDueEntryAtEstimate(input, target!));

    // The occurrence is now a single POSTED record.
    const posted = after.upcomingEntries.filter((e) => e.id === target!.id);
    expect(posted).toHaveLength(1);
    expect(posted[0].status).toBe('POSTED');

    expect(before.runway).not.toBeNull();
    expect(after.runway?.lowestBalanceCents).toBe(before.runway?.lowestBalanceCents);
    expect(after.runway?.lowestBalanceDate).toBe(before.runway?.lowestBalanceDate);
    expect(after.balances).toEqual(before.balances);
  });
});

// ---------------------------------------------------------------------------
// Property 7: Posting a due entry at its estimate leaves the projection unchanged
// ---------------------------------------------------------------------------

// Feature: plan-vs-actual-envelopes, Property 7: Posting a due entry at its estimate leaves the projection unchanged
// **Validates: Requirements 3.7**
describe('Property 7: Posting a due entry at its estimate leaves the projection unchanged', () => {
  // Adds a schedule whose first occurrence lands within two days of the
  // (varying) current date, so debits on business days and weekend-shifted
  // incomes are regularly due (shifted date on or before the current date).
  const dueInputArb = fc
    .tuple(
      baseInputArb,
      fc.integer({ min: 0, max: 13 }),
      fc.integer({ min: 0, max: 2 }),
      scheduleArb('due'),
    )
    .map(([base, dayShift, startAhead, due]): ProjectionInput => {
      const currentDate = addDays(TODAY, dayShift);
      return {
        ...base,
        currentDate,
        schedules: [
          ...base.schedules,
          { ...due, startDate: addDays(currentDate, startAhead) },
        ],
      };
    });

  it('keeps the daily available/ledger balance series and runway lowest balance identical', () => {
    fc.assert(
      fc.property(dueInputArb, fc.nat(), (input, pick) => {
        const before = projectCashFlow(input);
        const targets = before.upcomingEntries.filter(
          (e) =>
            e.scheduleId !== null &&
            e.status === 'PLANNED' &&
            e.actualAmountCents === null &&
            e.holdReleaseDate === undefined &&
            e.shiftedPostDate <= input.currentDate,
        );
        fc.pre(targets.length > 0);
        const target = targets[pick % targets.length];

        const after = projectCashFlow(postDueEntryAtEstimate(input, target));

        expect(after.balances).toEqual(before.balances);
        expect(after.runway?.lowestBalanceCents).toBe(before.runway?.lowestBalanceCents);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Overspending moves the runway by exactly the overage
// ---------------------------------------------------------------------------

// Feature: plan-vs-actual-envelopes, Property 22: Overspending moves the runway by exactly the overage
// **Validates: Requirements 9.5, 9.6, 9.7**
describe('Property 22: Overspending moves the runway by exactly the overage', () => {
  const resetArb = fc.constantFrom('WEEKLY', 'MONTHLY', 'EACH_PAY_CYCLE') as fc.Arbitrary<ResetPeriod>;

  /** Runs the projection with the envelope's commitment for the given line items. */
  const run = (
    input: ProjectionInput,
    envelope: { id: string; name: string; resetPeriod: ResetPeriod; budgetCents: number },
    lineItems: LineItemLike[],
    loggedTodayCents: number,
  ) => {
    const card = buildEnvelopeCardView({ envelope, lineItems, incomeDates: [], today: TODAY });
    const totals = computeEnvelopeTotals(envelope.budgetCents, lineItems, card.period);
    const commitments = buildEnvelopeCommitments(
      [{ id: envelope.id, name: envelope.name, period: card.period, leftCents: totals.leftCents }],
      TODAY,
    );
    const out = projectCashFlow({
      ...input,
      // Logging a purchase moves both starting balances by the amount.
      accounts: input.accounts.map((a) => ({
        ...a,
        ledgerBalanceCents: a.ledgerBalanceCents - loggedTodayCents,
        availableBalanceCents:
          a.availableBalanceCents === null ? null : a.availableBalanceCents - loggedTodayCents,
      })),
      envelopeCommitments: commitments,
    });
    return { card, out };
  };

  it('X <= Left leaves the runway unchanged; X > Left lowers it by exactly X - Left', () => {
    fc.assert(
      fc.property(
        baseInputArb,
        resetArb,
        fc.integer({ min: 0, max: 200_000 }), // budget
        fc.integer({ min: 0, max: 250_000 }), // already spent today
        fc.integer({ min: 1, max: 300_000 }), // X
        (input, resetPeriod, budget, priorSpent, x) => {
          const envelope = { id: 'env-p22', name: 'Groceries', resetPeriod, budgetCents: budget };
          // Dated today, so the line item and the commitment are both on or before any runway date.
          const prior: LineItemLike[] =
            priorSpent > 0 ? [{ id: 'li-prior', amountCents: priorSpent, purchaseDate: TODAY }] : [];
          const newItem: LineItemLike = { id: 'li-new', amountCents: x, purchaseDate: TODAY };

          const before = run(input, envelope, prior, 0);
          const after = run(input, envelope, [...prior, newItem], x);
          fc.pre(before.out.runway !== null && after.out.runway !== null);

          const left = before.card.leftCents;
          const expectedDrop = Math.max(0, x - left);

          expect(before.out.runway!.lowestBalanceCents - after.out.runway!.lowestBalanceCents).toBe(
            expectedDrop,
          );
          // The card's runway impact moves by exactly the same overage.
          expect(after.card.runwayImpactCents - before.card.runwayImpactCents).toBe(expectedDrop);
          expect(after.card.runwayImpactCents).toBe(after.card.overageCents);
          if (left > 0 || x > left) {
            // Starting from a non-overspent envelope the impact is the overage itself.
            if (before.card.overageCents === 0) expect(after.card.runwayImpactCents).toBe(expectedDrop);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: $50 left, logging $80 lowers the runway by $30; logging $50 changes nothing', () => {
    const input: ProjectionInput = {
      accounts: [
        { id: 'a1', isPrimary: true, ledgerBalanceCents: 100_000, availableBalanceCents: 100_000 },
      ],
      schedules: [],
      oneOffEntries: [],
      holidays: [],
      currentDate: TODAY,
      projectionHorizonDays: 30,
    };
    const envelope = { id: 'e', name: 'Dining', resetPeriod: 'MONTHLY' as const, budgetCents: 5_000 };
    const item = (cents: number): LineItemLike => ({ id: 'li', amountCents: cents, purchaseDate: TODAY });
    const base = run(input, envelope, [], 0);
    const exact = run(input, envelope, [item(5_000)], 5_000);
    const over = run(input, envelope, [item(8_000)], 8_000);
    expect(exact.out.runway?.lowestBalanceCents).toBe(base.out.runway?.lowestBalanceCents);
    expect(base.out.runway!.lowestBalanceCents - over.out.runway!.lowestBalanceCents).toBe(3_000);
    expect(over.card.runwayImpactCents).toBe(3_000);
  });
});
