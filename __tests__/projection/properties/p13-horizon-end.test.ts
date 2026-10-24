import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectCashFlow } from '@/lib/projection/engine';
import type { ProjectionInput, Schedule } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 13: Horizon-based projection end
// **Validates: Requirements 5.2**

const BASE = '2025-01-01';

const debitScheduleArb = fc.record({
  id: fc.uuid(),
  startOffset: fc.integer({ min: 0, max: 60 }),
  every: fc.integer({ min: 1, max: 45 }),
  amount: fc.integer({ min: 1, max: 100_000 }),
});

const inputArb = fc.record({
  horizon: fc.integer({ min: 1, max: 365 }),
  dayOffset: fc.integer({ min: 0, max: 1500 }),
  ledger: fc.integer({ min: -500_000, max: 5_000_000 }),
  available: fc.option(fc.integer({ min: -500_000, max: 5_000_000 }), { nil: null }),
  debits: fc.array(debitScheduleArb, { maxLength: 4 }),
});

function buildInput(
  p: {
    horizon: number;
    dayOffset: number;
    ledger: number;
    available: number | null;
    debits: { id: string; startOffset: number; every: number; amount: number }[];
  },
  horizon = p.horizon,
): ProjectionInput {
  const currentDate = addDays(BASE, p.dayOffset);
  const schedules: Schedule[] = p.debits.map((d, i) => ({
    id: `${d.id}-${i}`,
    name: `Bill ${i}`,
    accountId: 'acc',
    intervalType: 'DAYS',
    intervalValue: d.every,
    daysOfMonth: [],
    startDate: addDays(currentDate, d.startOffset),
    estimatedAmountCents: d.amount,
    entryType: 'DEBIT',
  }));
  return {
    accounts: [
      {
        id: 'acc',
        isPrimary: true,
        ledgerBalanceCents: p.ledger,
        availableBalanceCents: p.available,
      },
    ],
    schedules,
    oneOffEntries: [],
    holidays: [],
    currentDate,
    projectionHorizonDays: horizon,
  };
}

describe('Property 13: Horizon-based projection end', () => {
  it('with no future income, a single cycle ends at currentDate + horizon', () => {
    fc.assert(
      fc.property(inputArb, (p) => {
        const input = buildInput(p);
        const end = addDays(input.currentDate, p.horizon);
        const out = projectCashFlow(input);

        expect(out.payCycles).toHaveLength(1);
        expect(out.payCycles[0].startDate).toBe(input.currentDate);
        expect(out.payCycles[0].endDate).toBe(end);
        expect(out.payCycles[0].incomeEntryId).toBeNull();

        expect(out.runway).not.toBeNull();
        expect(out.runway!.projectionEndDate).toBe(end);
        expect(out.runway!.isBeforePayday).toBe(false);

        expect(out.balances[out.balances.length - 1].date).toBe(end);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects horizons outside 1..365 or non-integer', () => {
    const badHorizonArb = fc.oneof(
      fc.constant(0),
      fc.constant(366),
      fc.integer({ min: -1000, max: 0 }),
      fc.integer({ min: 366, max: 5000 }),
      fc
        .double({ min: 0.01, max: 400, noNaN: true })
        .filter((n) => !Number.isInteger(n)),
    );
    fc.assert(
      fc.property(inputArb, badHorizonArb, (p, bad) => {
        expect(() => projectCashFlow(buildInput(p, bad))).toThrow(/horizon/i);
      }),
      { numRuns: 100 },
    );
  });
});
