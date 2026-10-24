import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeEnvelopeTotals } from '../../src/lib/envelopes/totals';

const DAY_MS = 86_400_000;
const BASE_DAY = Date.parse('2020-01-01T00:00:00Z') / DAY_MS;
const toIso = (dayIndex: number) => new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

// Day offsets from the base date; ~1100 days covers leap years and year boundaries.
const dayOffset = fc.integer({ min: 0, max: 1100 });
const item = fc.record({
  id: fc.uuid(),
  amountCents: fc.integer({ min: 1, max: 999_999_999 }),
  offset: dayOffset,
});
const items = fc.array(item, { maxLength: 15 });
const budget = fc.integer({ min: 0, max: 2_000_000_000 });

const toLine = (i: { id: string; amountCents: number; offset: number }) => ({
  id: i.id,
  amountCents: i.amountCents,
  purchaseDate: toIso(BASE_DAY + i.offset),
});

describe('computeEnvelopeTotals', () => {
  it('Property 18: totals partition line items by period', () => {
    // **Validates: Requirements 8.5, 8.6, 8.7, 8.11, 10.1, 10.4**
    fc.assert(
      fc.property(budget, items, dayOffset, fc.integer({ min: 0, max: 60 }), (b, raw, startOff, len) => {
        const period = { start: toIso(BASE_DAY + startOff), end: toIso(BASE_DAY + startOff + len) };
        const lines = raw.map(toLine);
        const totals = computeEnvelopeTotals(b, lines, period);

        // Independent sum using numeric offsets: items outside the period are excluded.
        const expectedSpent = raw
          .filter((i) => i.offset >= startOff && i.offset <= startOff + len)
          .reduce((sum, i) => sum + i.amountCents, 0);
        expect(totals.spentCents).toBe(expectedSpent);

        expect(totals.leftCents).toBe(Math.max(0, b - expectedSpent));
        expect(totals.overageCents).toBe(Math.max(0, expectedSpent - b));
        expect(totals.leftCents - totals.overageCents).toBe(b - totals.spentCents);
        expect(totals.leftCents === 0 || totals.overageCents === 0).toBe(true);
      }),
    );
  });

  it('Property 18: moving an item to another contiguous period moves it between totals', () => {
    // **Validates: Requirements 8.11, 10.4**
    fc.assert(
      fc.property(
        budget,
        items,
        item,
        dayOffset,
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        fc.nat(),
        fc.nat(),
        (b, others, moved, startOff, lenA, lenB, pickA, pickB) => {
          // Two contiguous periods: A then B.
          const a = { start: toIso(BASE_DAY + startOff), end: toIso(BASE_DAY + startOff + lenA - 1) };
          const bStart = startOff + lenA;
          const bp = { start: toIso(BASE_DAY + bStart), end: toIso(BASE_DAY + bStart + lenB - 1) };

          const inA = toLine({ ...moved, offset: startOff + (pickA % lenA) });
          const inB = toLine({ ...moved, offset: bStart + (pickB % lenB) });
          const rest = others.map(toLine);

          const aWith = computeEnvelopeTotals(b, [...rest, inA], a);
          const aWithout = computeEnvelopeTotals(b, [...rest, inB], a);
          const bWith = computeEnvelopeTotals(b, [...rest, inB], bp);
          const bWithout = computeEnvelopeTotals(b, [...rest, inA], bp);

          // Item in A: counted in A only. After the date change: counted in B only.
          expect(aWith.spentCents - aWithout.spentCents).toBe(moved.amountCents);
          expect(bWith.spentCents - bWithout.spentCents).toBe(moved.amountCents);
        },
      ),
    );
  });

  it('includes items on both period boundary days and excludes the days just outside', () => {
    const period = { start: '2026-03-02', end: '2026-03-08' };
    const lines = [
      { id: 'a', amountCents: 100, purchaseDate: '2026-03-01' },
      { id: 'b', amountCents: 200, purchaseDate: '2026-03-02' },
      { id: 'c', amountCents: 400, purchaseDate: '2026-03-08' },
      { id: 'd', amountCents: 800, purchaseDate: '2026-03-09' },
    ];
    expect(computeEnvelopeTotals(1000, lines, period)).toEqual({
      spentCents: 600,
      leftCents: 400,
      overageCents: 0,
    });
    expect(computeEnvelopeTotals(500, lines, period)).toEqual({
      spentCents: 600,
      leftCents: 0,
      overageCents: 100,
    });
  });
});
