import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectCashFlow } from '@/lib/projection/engine';
import type { Entry, ProjectionInput, Schedule } from '@/lib/projection/types';
import { generateDemoData } from '@/sources/fake-source';
import { holidaysAround } from '../../helpers/demo';

// Feature: projection-engine-cycle-view, Property 40: Projection purity
// **Validates: Requirements 14.1**

const BASE = '2025-01-01';

const dateArb = fc
  .integer({ min: 0, max: 3 * 365 })
  .map((offset) => addDays(BASE, offset));

const scheduleArb: fc.Arbitrary<Schedule> = fc
  .record({
    n: fc.nat({ max: 999 }),
    intervalType: fc.constantFrom('DAYS', 'WEEKS', 'MONTHS', 'DAYS_OF_MONTH' as const),
    intervalValue: fc.integer({ min: 1, max: 6 }),
    daysOfMonth: fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { minLength: 1, maxLength: 3 }),
    startOffset: fc.integer({ min: -60, max: 60 }),
    amount: fc.integer({ min: 1, max: 500_000 }),
    entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
  })
  .map((r) => ({
    id: `s${r.n}`,
    name: `Schedule ${r.n}`,
    accountId: 'acct0',
    intervalType: r.intervalType,
    intervalValue: r.intervalValue,
    daysOfMonth: r.intervalType === 'DAYS_OF_MONTH' ? r.daysOfMonth : [],
    startDate: addDays(BASE, 365 + r.startOffset),
    estimatedAmountCents: r.amount,
    entryType: r.entryType,
  }));

const oneOffArb: fc.Arbitrary<Entry> = fc
  .record({
    offset: fc.integer({ min: -30, max: 90 }),
    amount: fc.integer({ min: 1, max: 500_000 }),
    actual: fc.option(fc.integer({ min: 1, max: 500_000 }), { nil: null }),
    entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
    status: fc.constantFrom('PLANNED' as const, 'PENDING' as const, 'POSTED' as const, 'SKIPPED' as const),
    hold: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
  })
  .map((r) => {
    const postDate = addDays(BASE, 365 + r.offset);
    return {
      id: '',
      accountId: 'acct0',
      scheduleId: null,
      postDate,
      shiftedPostDate: postDate,
      estimatedAmountCents: r.amount,
      actualAmountCents: r.actual,
      status: r.status,
      entryType: r.entryType,
      ...(r.hold === undefined ? {} : { holdReleaseDate: addDays(postDate, r.hold) }),
    };
  });

const randomInputArb: fc.Arbitrary<ProjectionInput> = fc
  .record({
    schedules: fc.array(scheduleArb, { maxLength: 4 }),
    oneOffs: fc.array(oneOffArb, { maxLength: 6 }),
    ledger: fc.integer({ min: -1_000_000, max: 2_000_000 }),
    available: fc.option(fc.integer({ min: -1_000_000, max: 2_000_000 }), { nil: null }),
    hasPrimary: fc.boolean(),
    horizon: fc.integer({ min: 1, max: 90 }),
    threshold: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
    today: fc.integer({ min: 365 - 30, max: 365 + 30 }).map((o) => addDays(BASE, o)),
  })
  .map((r) => ({
    accounts: [
      {
        id: 'acct0',
        isPrimary: r.hasPrimary,
        ledgerBalanceCents: r.ledger,
        availableBalanceCents: r.available,
      },
    ],
    // Unique ids so the output is well-formed.
    schedules: r.schedules.map((s, i) => ({ ...s, id: `s${i}` })),
    oneOffEntries: r.oneOffs.map((e, i) => ({ ...e, id: `e${i}` })),
    holidays: holidaysAround(Number(r.today.slice(0, 4))),
    currentDate: r.today,
    projectionHorizonDays: r.horizon,
    lowBalanceThresholdCents: r.threshold,
  }));

const demoInputArb: fc.Arbitrary<ProjectionInput> = dateArb.map((today) => {
  const demo = generateDemoData(today);
  return {
    accounts: demo.accounts,
    schedules: demo.schedules,
    oneOffEntries: demo.oneOffEntries,
    holidays: holidaysAround(Number(today.slice(0, 4))),
    currentDate: today,
    projectionHorizonDays: demo.workspaceSettings.projectionHorizonDays,
    lowBalanceThresholdCents: demo.workspaceSettings.lowBalanceThresholdCents,
  };
});

function assertPure(input: ProjectionInput) {
  const snapshot = structuredClone(input);
  const output1 = projectCashFlow(input);
  const output2 = projectCashFlow(input);
  expect(output2).toEqual(output1);
  expect(input).toEqual(snapshot); // no mutation (Req 14.1)
}

describe('Property 40: Projection purity', () => {
  it('random schedules, one-offs and accounts: identical outputs, input not mutated', () => {
    fc.assert(fc.property(randomInputArb, (input) => assertPure(input)), { numRuns: 100 });
  });

  it('demo input across varying dates: identical outputs, input not mutated', () => {
    fc.assert(fc.property(demoInputArb, (input) => assertPure(input)), { numRuns: 100 });
  });
});
