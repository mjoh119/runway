import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runwayImpact } from '@/lib/runway-impact';

const runway = { lowestBalanceCents: 13_000, lowestBalanceDate: '2026-10-26' };
const base = { entryType: 'DEBIT' as const, estimateCents: -120_000, entryDate: '2026-10-26', runway };

describe('runwayImpact', () => {
  it('is unknown without a runway', () => {
    expect(runwayImpact({ ...base, actualCents: 120_000, runway: null })).toEqual({ kind: 'unknown' });
  });

  it('stays put when the amount matches the estimate', () => {
    expect(runwayImpact({ ...base, actualCents: 120_000 })).toEqual({
      kind: 'unchanged',
      reason: 'matches-estimate',
      runwayCents: 13_000,
    });
  });

  it('drops by the overage on a debit posted above its estimate', () => {
    expect(runwayImpact({ ...base, actualCents: 125_000 })).toEqual({
      kind: 'lower',
      runwayCents: 8_000,
      deltaCents: 5_000,
    });
  });

  it('rises when a debit is posted below its estimate', () => {
    expect(runwayImpact({ ...base, actualCents: 110_000 })).toMatchObject({ kind: 'higher', runwayCents: 23_000 });
  });

  it('drops when income is posted below its estimate', () => {
    expect(
      runwayImpact({ ...base, entryType: 'INCOME', estimateCents: 240_000, actualCents: 235_000 }),
    ).toMatchObject({ kind: 'lower', runwayCents: 8_000, deltaCents: 5_000 });
  });

  it('does not move the runway for an entry after the lowest-balance date', () => {
    expect(runwayImpact({ ...base, entryDate: '2026-10-27', actualCents: 130_000 })).toEqual({
      kind: 'unchanged',
      reason: 'after-lowest',
      runwayCents: 13_000,
    });
  });

  it('shifts the runway by exactly the signed variance (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('INCOME' as const, 'DEBIT' as const),
        fc.integer({ min: 1, max: 999_999_999 }),
        fc.integer({ min: 1, max: 999_999_999 }),
        (entryType, estimate, actual) => {
          const out = runwayImpact({ entryType, estimateCents: estimate, actualCents: actual, entryDate: '2026-10-20', runway });
          const variance = (entryType === 'INCOME' ? 1 : -1) * (actual - estimate);
          if (variance === 0) expect(out.kind).toBe('unchanged');
          else expect(out).toMatchObject({ runwayCents: runway.lowestBalanceCents + variance });
        },
      ),
    );
  });
});