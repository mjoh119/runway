import { describe, expect, it } from 'vitest';
import { buildCycleViewModel, runwayLabel } from '@/lib/cycle-view-model';
import type { PayCycle, ProjectedBalance, RunwayResult } from '@/lib/projection/types';

function day(n: number): string {
  const d = new Date(Date.UTC(2025, 0, 1 + n));
  return d.toISOString().slice(0, 10);
}

function balances(count: number): ProjectedBalance[] {
  return Array.from({ length: count }, (_, i) => ({
    date: day(i),
    ledgerBalanceCents: 100_000 + i,
    availableBalanceCents: 90_000 + i,
    isEstimated: i % 2 === 0,
  }));
}

function runway(isBeforePayday: boolean, endIdx: number): RunwayResult {
  return {
    lowestBalanceCents: 5_000,
    lowestBalanceDate: day(3),
    isBeforePayday,
    projectionEndDate: day(endIdx),
  };
}

describe('runwayLabel', () => {
  it('returns "before payday" when bounded by income', () => {
    expect(runwayLabel(true, 30)).toBe('before payday');
  });

  it('returns "within the next N days" for horizon runway', () => {
    expect(runwayLabel(false, 30)).toBe('within the next 30 days');
  });
});

describe('buildCycleViewModel', () => {
  it('covers the current and next cycles only', () => {
    const payCycles: PayCycle[] = [
      { startDate: day(0), endDate: day(9), incomeEntryId: 'a' },
      { startDate: day(10), endDate: day(19), incomeEntryId: 'b' },
      { startDate: day(20), endDate: day(29), incomeEntryId: 'c' },
    ];
    const vm = buildCycleViewModel({ balances: balances(30), runway: runway(true, 9), payCycles }, 30);

    expect(vm.isFullHorizon).toBe(false);
    expect(vm.range).toEqual({ start: day(0), end: day(19) });
    expect(vm.series).toHaveLength(20);
    expect(vm.boundaries.map((b) => b.date)).toEqual([day(0), day(10)]);
    expect(vm.runwayLabel).toBe('before payday');
    expect(vm.series[0]).toEqual({
      date: day(0),
      availableCents: 90_000,
      ledgerCents: 100_000,
      isEstimated: true,
    });
  });

  it('falls back to the full horizon when there are no cycles', () => {
    const vm = buildCycleViewModel({ balances: balances(30), runway: runway(false, 29), payCycles: [] }, 30);

    expect(vm.isFullHorizon).toBe(true);
    expect(vm.series).toHaveLength(30);
    expect(vm.range).toEqual({ start: day(0), end: day(29) });
    expect(vm.boundaries).toEqual([]);
    expect(vm.runwayLabel).toBe('within the next 30 days');
  });

  it('derives N from the projection span when horizonDays is omitted', () => {
    const vm = buildCycleViewModel({ balances: balances(30), runway: runway(false, 29), payCycles: [] });
    expect(vm.runwayLabel).toBe('within the next 29 days');
  });

  it('gives a null label when runway is null', () => {
    const vm = buildCycleViewModel({ balances: balances(5), runway: null, payCycles: [] }, 30);
    expect(vm.runwayLabel).toBeNull();
  });

  it('returns a null range for empty balances', () => {
    const vm = buildCycleViewModel({ balances: [], runway: null, payCycles: [] }, 30);
    expect(vm.range).toBeNull();
    expect(vm.series).toEqual([]);
  });
});
