import { describe, expect, it } from 'vitest';
import { estimateAvailableBalance, projectBalances } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

function entry(p: Partial<Entry> & { id: string }): Entry {
  return {
    accountId: 'a',
    scheduleId: null,
    postDate: '2025-01-03',
    shiftedPostDate: '2025-01-03',
    estimatedAmountCents: 1000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'DEBIT',
    ...p,
  };
}

describe('projectBalances', () => {
  it('returns one row per day inclusive and applies a planned debit to both balances', () => {
    const rows = projectBalances(10000, 10000, [entry({ id: 'd' })], '2025-01-01', '2025-01-05');
    expect(rows).toHaveLength(5);
    expect(rows[1].availableBalanceCents).toBe(10000);
    expect(rows[2]).toMatchObject({ ledgerBalanceCents: 9000, availableBalanceCents: 9000 });
  });

  it('delays available for a planned deposit with a hold', () => {
    const e = entry({ id: 'i', entryType: 'INCOME', holdReleaseDate: '2025-01-05' });
    const rows = projectBalances(0, 0, [e], '2025-01-01', '2025-01-06');
    expect(rows[2]).toMatchObject({ ledgerBalanceCents: 1000, availableBalanceCents: 0 });
    expect(rows[4].availableBalanceCents).toBe(1000);
  });

  it('releases a posted held deposit into available only', () => {
    const e = entry({ id: 'p', status: 'POSTED', entryType: 'INCOME', holdReleaseDate: '2025-01-04' });
    const rows = projectBalances(5000, 4000, [e], '2025-01-01', '2025-01-05');
    expect(rows[3]).toMatchObject({ ledgerBalanceCents: 5000, availableBalanceCents: 5000 });
  });

  it('moves a pending debit in ledger only and ignores skipped entries', () => {
    const pending = entry({ id: 'x', status: 'PENDING' });
    const skipped = entry({ id: 's', status: 'SKIPPED' });
    const rows = projectBalances(5000, 4000, [pending, skipped], '2025-01-01', '2025-01-04');
    expect(rows[3]).toMatchObject({ ledgerBalanceCents: 4000, availableBalanceCents: 4000 });
  });

  it('applies overdue planned entries at the start date', () => {
    const e = entry({ id: 'o', shiftedPostDate: '2024-12-30' });
    const rows = projectBalances(5000, 5000, [e], '2025-01-01', '2025-01-02');
    expect(rows[0].availableBalanceCents).toBe(4000);
  });

  it('estimates available when null, flags rows, and does not mutate input', () => {
    const entries = [
      entry({ id: 'p', status: 'PENDING', estimatedAmountCents: 300 }),
      entry({ id: 'h', status: 'POSTED', entryType: 'INCOME', holdReleaseDate: '2025-01-09', estimatedAmountCents: 500 }),
    ];
    const copy = JSON.parse(JSON.stringify(entries));
    expect(estimateAvailableBalance(10000, entries)).toBe(9200);
    const rows = projectBalances(10000, null, entries, '2025-01-01', '2025-01-02');
    expect(rows[0]).toMatchObject({ availableBalanceCents: 9200, isEstimated: true });
    expect(entries).toEqual(copy);
  });
});
