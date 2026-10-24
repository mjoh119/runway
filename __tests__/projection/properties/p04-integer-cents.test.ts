import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { run } from '../../helpers/demo';
import type { Entry } from '@/lib/projection/types';

// Feature: projection-engine-cycle-view, Property 4: Integer cents representation
// **Validates: Requirements 3.1**

const dateArb = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

const entryAmounts = (entries: Entry[]): number[] =>
  entries.flatMap((e) =>
    e.actualAmountCents === null
      ? [e.estimatedAmountCents]
      : [e.estimatedAmountCents, e.actualAmountCents],
  );

describe('Property 4: Integer cents representation', () => {
  it('every money field in demo projections is an integer', () => {
    fc.assert(
      fc.property(dateArb, (today) => {
        const { demo, projection } = run(today);
        const money: number[] = [];

        for (const a of demo.accounts) {
          money.push(a.ledgerBalanceCents);
          if (a.availableBalanceCents !== null) money.push(a.availableBalanceCents);
        }
        for (const b of projection.balances) {
          money.push(b.ledgerBalanceCents, b.availableBalanceCents);
        }
        if (projection.runway) money.push(projection.runway.lowestBalanceCents);
        money.push(...entryAmounts(projection.upcomingEntries));
        money.push(...entryAmounts(projection.warnings.overdueEntries ?? []));
        const t = projection.warnings.belowThreshold;
        if (t) money.push(t.thresholdCents, t.lowestBalanceCents);

        expect(money.length).toBeGreaterThan(0);
        for (const m of money) {
          expect(Number.isInteger(m)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
