import { describe, expect, it } from 'vitest';
import { estimateAvailableBalance, projectBalances } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

const START = '2026-01-05';
const END = '2026-01-10';

function entry(p: Partial<Entry> & { id: string }): Entry {
  return {
    accountId: 'a',
    scheduleId: null,
    postDate: START,
    shiftedPostDate: START,
    estimatedAmountCents: 0,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'DEBIT',
    ...p,
  };
}

const pendingDebit = entry({
  id: 'pending-debit',
  status: 'PENDING',
  entryType: 'DEBIT',
  estimatedAmountCents: 5000,
});

const heldDeposit = entry({
  id: 'held-deposit',
  status: 'POSTED',
  entryType: 'INCOME',
  estimatedAmountCents: 30000,
  holdReleaseDate: '2026-01-08', // after START
});

describe('estimateAvailableBalance', () => {
  it('subtracts pending debits and held deposits from the ledger', () => {
    expect(estimateAvailableBalance(200000, [pendingDebit, heldDeposit], START)).toBe(165000);
  });
});

describe('projectBalances isEstimated', () => {
  const entries = [pendingDebit, heldDeposit];

  it('flags every row as estimated and starts from the estimate when source available is null', () => {
    const rows = projectBalances(200000, null, entries, START, END);
    expect(rows.every((r) => r.isEstimated)).toBe(true);
    expect(rows[0].availableBalanceCents).toBe(165000);
  });

  it('does not flag rows as estimated when source available is provided', () => {
    const rows = projectBalances(200000, 165000, entries, START, END);
    expect(rows.every((r) => !r.isEstimated)).toBe(true);
    expect(rows[0].availableBalanceCents).toBe(165000);
  });
});
