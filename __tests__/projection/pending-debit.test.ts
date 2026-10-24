import { describe, expect, it } from 'vitest';
import { projectBalances } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

// Validates: Requirements 6.8
describe('pending debit posting (ledger only)', () => {
  const pendingDebit: Entry = {
    id: 'pending-debit',
    accountId: 'a',
    scheduleId: null,
    postDate: '2026-01-05',
    shiftedPostDate: '2026-01-05',
    estimatedAmountCents: 2000,
    actualAmountCents: null,
    status: 'PENDING',
    entryType: 'DEBIT',
  };

  it('drops ledger on the expected post date and leaves available unchanged', () => {
    const rows = projectBalances(100000, 98000, [pendingDebit], '2026-01-01', '2026-01-08');

    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.availableBalanceCents).toBe(98000);
      expect(row.ledgerBalanceCents).toBe(row.date >= '2026-01-05' ? 98000 : 100000);
    }
    expect(rows.find((r) => r.date === '2026-01-04')?.ledgerBalanceCents).toBe(100000);
    expect(rows.find((r) => r.date === '2026-01-05')?.ledgerBalanceCents).toBe(98000);
  });
});
