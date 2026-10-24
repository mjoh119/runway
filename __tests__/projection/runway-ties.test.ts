import { describe, expect, it } from 'vitest';
import { computeRunway } from '../../src/lib/projection/runway';
import type { ProjectedBalance } from '../../src/lib/projection/types';

function row(day: number, cents: number): ProjectedBalance {
  return {
    date: `2025-01-${String(day).padStart(2, '0')}`,
    ledgerBalanceCents: cents,
    availableBalanceCents: cents,
    isEstimated: false,
  };
}

describe('computeRunway tie-breaking', () => {
  it('picks the earlier date when the lowest balance occurs more than once', () => {
    const balances = [row(1, 20000), row(2, 10000), row(3, 10000), row(4, 30000)];

    const result = computeRunway(balances, '2025-01-20', '2025-01-30');

    expect(result).not.toBeNull();
    expect(result!.lowestBalanceCents).toBe(10000);
    expect(result!.lowestBalanceDate).toBe('2025-01-02');
  });
});
