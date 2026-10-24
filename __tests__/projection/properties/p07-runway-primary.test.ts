import { describe, it } from 'vitest';
import fc from 'fast-check';
import { addDays } from '@/lib/projection/dates';
import { projectCashFlow } from '@/lib/projection/engine';
import type { Entry, ProjectionInput } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 7: Runway computed on primary account
// **Validates: Requirements 3.5, 3.6**
// Also covers Requirement 9.6: no primary account -> runway null, balances empty.

const TODAY = '2025-03-03';

const entryArb = (accountId: string, prefix: string): fc.Arbitrary<Entry> =>
  fc.record({
    offset: fc.integer({ min: 0, max: 60 }),
    amount: fc.integer({ min: 1, max: 500_000 }),
    entryType: fc.constantFrom('INCOME' as const, 'DEBIT' as const),
    status: fc.constantFrom('PLANNED' as const, 'PENDING' as const, 'SKIPPED' as const),
  }).map(({ offset, amount, entryType, status }) => {
    const postDate = addDays(TODAY, offset);
    return {
      id: '',
      accountId,
      scheduleId: null,
      postDate,
      shiftedPostDate: postDate,
      estimatedAmountCents: amount,
      actualAmountCents: null,
      status,
      entryType,
      description: prefix,
    };
  });

const entriesArb = (accountId: string): fc.Arbitrary<Entry[]> =>
  fc
    .array(entryArb(accountId, accountId), { maxLength: 8 })
    .map((es) => es.map((e, i) => ({ ...e, id: `${accountId}-e${i}` })));

const balancesArb = fc.record({
  ledger: fc.integer({ min: -1_000_000, max: 2_000_000 }),
  available: fc.option(fc.integer({ min: -1_000_000, max: 2_000_000 }), { nil: null }),
});

const scenarioArb = fc.record({
  primary: balancesArb,
  primaryEntries: entriesArb('primary'),
  others: fc.array(
    fc.record({ bal: balancesArb }).chain(({ bal }) =>
      entriesArb('other').map((entries) => ({ bal, entries })),
    ),
    { minLength: 1, maxLength: 3 },
  ),
  primaryIndex: fc.nat({ max: 3 }),
  horizon: fc.integer({ min: 1, max: 90 }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scenario = any;

function buildInput(s: Scenario, withOthers: boolean): ProjectionInput {
  const others = withOthers ? s.others : [];
  const accounts = others.map((o: any, i: number) => ({
    id: `other${i}`,
    isPrimary: false,
    ledgerBalanceCents: o.bal.ledger,
    availableBalanceCents: o.bal.available,
  }));
  const primaryAccount = {
    id: 'primary',
    isPrimary: true,
    ledgerBalanceCents: s.primary.ledger,
    availableBalanceCents: s.primary.available,
  };
  accounts.splice(Math.min(s.primaryIndex, accounts.length), 0, primaryAccount);

  const oneOffEntries: Entry[] = [
    ...s.primaryEntries,
    ...others.flatMap((o: any, i: number) =>
      o.entries.map((e: Entry) => ({ ...e, id: `other${i}-${e.id}`, accountId: `other${i}` })),
    ),
  ];
  return {
    accounts,
    schedules: [],
    oneOffEntries,
    holidays: [],
    currentDate: TODAY,
    projectionHorizonDays: s.horizon,
  };
}

describe('Property 7: Runway computed on primary account', () => {
  it('balances and runway depend only on the primary account', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const full = projectCashFlow(buildInput(s, true));
        const solo = projectCashFlow(buildInput(s, false));
        return (
          JSON.stringify(full.balances) === JSON.stringify(solo.balances) &&
          JSON.stringify(full.runway) === JSON.stringify(solo.runway) &&
          full.runway !== null
        );
      }),
      { numRuns: 100 },
    );
  });

  it('rows are estimated exactly when the primary available balance is null', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const out = projectCashFlow(buildInput(s, true));
        const expected = s.primary.available === null;
        return out.balances.length > 0 && out.balances.every((b) => b.isEstimated === expected);
      }),
      { numRuns: 100 },
    );
  });

  it('with no primary account, runway is null and balances are empty', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const input = buildInput(s, true);
        input.accounts = input.accounts.map((a) => ({ ...a, isPrimary: false }));
        const out = projectCashFlow(input);
        return out.runway === null && out.balances.length === 0;
      }),
      { numRuns: 100 },
    );
  });
});
