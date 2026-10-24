import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays } from '../../src/lib/projection/dates';
import { planOneOff, type OneOffInput } from '../../src/lib/entry-service/plan-one-off';
import { findOverdueEntries } from '../../src/lib/projection/warnings';
import type { Entry } from '../../src/lib/projection/types';

const TODAY = '2026-03-15';

function input(overrides: Partial<OneOffInput>): OneOffInput {
  return {
    direction: 'debit',
    amountCents: 4_250,
    date: TODAY,
    alreadyHappened: false,
    today: TODAY,
    ...overrides,
  };
}

describe('planOneOff', () => {
  it('saves a past-dated "already happened" one-off as POSTED and not overdue', () => {
    const result = planOneOff(input({ date: '2026-03-10', alreadyHappened: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.value;

    expect(plan.status).toBe('POSTED');
    expect(plan.estimatedAmountCents).toBe(-4_250);
    expect(plan.actualAmountCents).toBe(-4_250);
    expect(plan.actualDate).toBe('2026-03-10');
    expect(plan.balanceDelta).toEqual({ ledgerCents: -4_250, availableCents: -4_250 });

    const entry: Entry = {
      id: 'one-off-1',
      accountId: 'acct-1',
      scheduleId: null,
      postDate: plan.postDate,
      shiftedPostDate: plan.postDate,
      estimatedAmountCents: plan.estimatedAmountCents,
      actualAmountCents: plan.actualAmountCents,
      status: plan.status,
      entryType: plan.entryType,
      actualDate: plan.actualDate ?? undefined,
    };
    expect(findOverdueEntries([entry], TODAY)).toEqual([]);
  });

  it('rejects a planned one-off dated before today with the exact message', () => {
    const result = planOneOff(input({ date: '2026-03-14', alreadyHappened: false }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toBe('Planned entries need a date today or later');
    expect(result).not.toHaveProperty('value');
  });

  it('rejects an "already happened" one-off dated after today', () => {
    const result = planOneOff(input({ date: '2026-03-16', alreadyHappened: true }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
  });

  it.each(['2026-03-15', '2026-04-01'])(
    'plans an unchecked one-off dated %s as PLANNED with a zero delta',
    (date) => {
      const result = planOneOff(input({ date, alreadyHappened: false }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('PLANNED');
      expect(result.value.actualAmountCents).toBeNull();
      expect(result.value.balanceDelta).toEqual({ ledgerCents: 0, availableCents: 0 });
    },
  );
});

describe('planOneOff properties', () => {
  // Feature: plan-vs-actual-envelopes, Property 10: One-off planning validates and shapes the entry
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.10, 5.11**
  const directionArb = fc.constantFrom('debit', 'income', 'DEBIT', 'Income');
  const amountArb = fc.integer({ min: 1, max: 999_999_999 });
  const todayArb = fc.integer({ min: -3_000, max: 3_000 }).map((n) => addDays(TODAY, n));
  const offsetArb = fc.integer({ min: -400, max: 400 });

  it('rejects invalid directions and dates with VALIDATION and no value', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            direction: fc.constantFrom('', 'transfer', 'debits', 'credit'),
            date: fc.constant(TODAY),
          }),
          fc.record({
            direction: directionArb,
            date: fc.constantFrom('', '2026-02-30', '2026-13-01', 'tomorrow', '2026-3-5'),
          }),
        ),
        amountArb,
        fc.boolean(),
        (base, amountCents, alreadyHappened) => {
          const result = planOneOff(input({ ...base, amountCents, alreadyHappened }));
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error.code).toBe('VALIDATION');
          expect(result).not.toHaveProperty('value');
        },
      ),
    );
  });

  it('accepts or rejects by date relative to today and shapes the plan', () => {
    fc.assert(
      fc.property(
        directionArb,
        amountArb,
        todayArb,
        offsetArb,
        fc.boolean(),
        (direction, amountCents, today, offset, alreadyHappened) => {
          const date = addDays(today, offset);
          const result = planOneOff({ direction, amountCents, date, alreadyHappened, today });
          const valid = alreadyHappened ? date <= today : date >= today;

          expect(result.ok).toBe(valid);
          if (!result.ok) {
            expect(result.error.code).toBe('VALIDATION');
            expect(result).not.toHaveProperty('value');
            if (!alreadyHappened) {
              expect(result.error.message).toBe('Planned entries need a date today or later');
            }
            return;
          }

          const plan = result.value;
          const isIncome = direction.toLowerCase() === 'income';
          const signed = isIncome ? amountCents : -amountCents;
          expect(plan.entryType).toBe(isIncome ? 'INCOME' : 'DEBIT');
          expect(plan.postDate).toBe(date);
          expect(plan.estimatedAmountCents).toBe(signed);

          if (alreadyHappened) {
            expect(plan.status).toBe('POSTED');
            expect(plan.actualAmountCents).toBe(signed);
            expect(plan.actualDate).toBe(date);
            // No hold on a one-off: ledger and available both move by the signed amount.
            expect(plan.balanceDelta).toEqual({ ledgerCents: signed, availableCents: signed });
          } else {
            expect(plan.status).toBe('PLANNED');
            expect(plan.actualAmountCents).toBeNull();
            expect(plan.actualDate).toBeNull();
            expect(plan.balanceDelta).toEqual({ ledgerCents: 0, availableCents: 0 });
          }
        },
      ),
    );
  });
});
