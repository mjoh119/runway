import { describe, expect, it } from 'vitest';
import { projectBalances } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

const START = '2026-01-01';
const END = '2026-01-12';

function deposit(p: Partial<Entry> & { id: string }): Entry {
  return {
    accountId: 'a',
    scheduleId: null,
    postDate: '2026-01-05',
    shiftedPostDate: '2026-01-05',
    estimatedAmountCents: 50000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'INCOME',
    ...p,
  };
}

const byDate = (rows: ReturnType<typeof projectBalances>, date: string) => {
  const row = rows.find((r) => r.date === date);
  if (!row) throw new Error(`no row for ${date}`);
  return row;
};

describe('held deposit release', () => {
  // Validates: Requirements 6.6
  it('planned deposit with hold hits ledger on the post date and available on the release date', () => {
    const e = deposit({ id: 'planned', holdReleaseDate: '2026-01-10' });
    const rows = projectBalances(100000, 100000, [e], START, END);

    expect(byDate(rows, '2026-01-04')).toMatchObject({
      ledgerBalanceCents: 100000,
      availableBalanceCents: 100000,
    });
    expect(byDate(rows, '2026-01-05')).toMatchObject({
      ledgerBalanceCents: 150000,
      availableBalanceCents: 100000,
    });
    expect(byDate(rows, '2026-01-09')).toMatchObject({
      ledgerBalanceCents: 150000,
      availableBalanceCents: 100000,
    });
    expect(byDate(rows, '2026-01-10')).toMatchObject({
      ledgerBalanceCents: 150000,
      availableBalanceCents: 150000,
    });
    expect(byDate(rows, '2026-01-12').availableBalanceCents).toBe(150000);
  });

  // Validates: Requirements 6.7
  it('posted-but-held deposit raises available on the release date and leaves ledger unchanged', () => {
    const e = deposit({
      id: 'posted',
      status: 'POSTED',
      estimatedAmountCents: 4000,
      postDate: '2025-12-31',
      shiftedPostDate: '2025-12-31',
      holdReleaseDate: '2026-01-08',
    });
    // Starting ledger already includes the $40; starting available does not.
    const rows = projectBalances(54000, 50000, [e], START, END);

    for (const r of rows) expect(r.ledgerBalanceCents).toBe(54000);
    expect(byDate(rows, '2026-01-07').availableBalanceCents).toBe(50000);
    expect(byDate(rows, '2026-01-08').availableBalanceCents).toBe(54000);
    expect(byDate(rows, '2026-01-12').availableBalanceCents).toBe(54000);
  });
});
