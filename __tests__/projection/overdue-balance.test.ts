import { describe, expect, it } from 'vitest';
import { projectBalances } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

// Validates: Requirements 12.1
describe('overdue planned entries', () => {
  const overdueDebit: Entry = {
    id: 'overdue-debit',
    accountId: 'a',
    scheduleId: null,
    postDate: '2026-01-03',
    shiftedPostDate: '2026-01-03',
    estimatedAmountCents: 12000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'DEBIT',
  };

  it('applies the estimate to both balances on the start date', () => {
    const rows = projectBalances(100000, 100000, [overdueDebit], '2026-01-05', '2026-01-08');

    expect(rows).toHaveLength(4);
    expect(rows[0].date).toBe('2026-01-05');
    expect(rows[0].ledgerBalanceCents).toBe(88000);
    expect(rows[0].availableBalanceCents).toBe(88000);
    for (const row of rows) {
      expect(row.ledgerBalanceCents).toBe(88000);
      expect(row.availableBalanceCents).toBe(88000);
    }
  });

  it('does not mutate the input entries', () => {
    const entries = [overdueDebit];
    const snapshot = structuredClone(entries);
    projectBalances(100000, 100000, entries, '2026-01-05', '2026-01-08');
    expect(entries).toEqual(snapshot);
  });
});
