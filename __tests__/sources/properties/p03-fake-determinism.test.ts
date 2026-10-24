import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FakeSource } from '@/sources/fake-source';

// Feature: projection-engine-cycle-view, Property 3: FakeSource determinism
// **Validates: Requirements 2.4**

describe('Property 3: FakeSource determinism', () => {
  it('returns deep-equal accounts across repeated calls and fresh instances', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), fc.boolean(), async (calls, fresh) => {
        const shared = new FakeSource();
        const first = await shared.getAccounts();
        for (let i = 1; i < calls; i++) {
          const next = await (fresh ? new FakeSource() : shared).getAccounts();
          expect(next).toEqual(first);
        }

        // At least one account has non-null ledger and available balances
        expect(
          first.some((a) => a.ledgerBalanceCents !== null && a.availableBalanceCents !== null),
        ).toBe(true);
        // Exactly one primary
        expect(first.filter((a) => a.isPrimary)).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });

  it('returns deep-equal sync results for the same cursor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        fc.integer({ min: 2, max: 10 }),
        async (cursor, calls) => {
          const source = new FakeSource();
          const first = await source.syncTransactions(cursor);
          for (let i = 1; i < calls; i++) {
            expect(await source.syncTransactions(cursor)).toEqual(first);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns fresh copies so mutation does not leak between calls', async () => {
    const source = new FakeSource();
    const a = await source.getAccounts();
    const snapshot = structuredClone(a);
    a[0].ledgerBalanceCents = -1;
    expect(await source.getAccounts()).toEqual(snapshot);
  });
});
