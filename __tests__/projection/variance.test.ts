import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeCumulativeVariance, entryVariance } from '../../src/lib/projection/variance';
import type { Entry } from '../../src/lib/projection/types';

function entry(
  entryType: Entry['entryType'],
  estimate: number,
  actual: number | null,
  scheduleId: string | null = 'sched',
): Entry {
  return {
    id: 'e1',
    accountId: 'a1',
    scheduleId,
    postDate: '2026-03-10',
    shiftedPostDate: '2026-03-10',
    estimatedAmountCents: estimate,
    actualAmountCents: actual,
    status: 'POSTED',
    entryType,
    actualDate: '2026-03-10',
  };
}

const signedOf = (type: Entry['entryType'], magnitude: number) => (type === 'INCOME' ? magnitude : -magnitude);

const direction = fc.constantFrom<Entry['entryType']>('INCOME', 'DEBIT');
const magnitude = fc.integer({ min: 1, max: 999_999_999 });

describe('entryVariance', () => {
  // Feature: plan-vs-actual-envelopes, Property 12: Variance is signed actual minus signed estimate
  // **Validates: Requirements 6.1, 6.11**
  it('Property 12: equals signed actual minus signed estimate', () => {
    fc.assert(
      fc.property(direction, magnitude, magnitude, (type, est, act) => {
        // Stored amounts are signed by direction, as the app persists them.
        const e = entry(type, signedOf(type, est), signedOf(type, act));
        expect(entryVariance(e)).toBe(signedOf(type, act) - signedOf(type, est));
      }),
    );
  });

  it('Property 12: sign convention does not depend on how the amounts were stored', () => {
    fc.assert(
      fc.property(direction, magnitude, magnitude, fc.boolean(), fc.boolean(), (type, est, act, negEst, negAct) => {
        const e = entry(type, negEst ? -est : est, negAct ? -act : act);
        expect(entryVariance(e)).toBe(signedOf(type, act) - signedOf(type, est));
      }),
    );
  });

  it('Property 12: a posted one-off (actual equals estimate) has zero variance', () => {
    fc.assert(
      fc.property(direction, magnitude, (type, amount) => {
        const signedAmount = signedOf(type, amount);
        expect(entryVariance(entry(type, signedAmount, signedAmount, null))).toBe(0);
      }),
    );
  });

  it('matches the spec examples', () => {
    expect(entryVariance(entry('DEBIT', -8500, -9200))).toBe(-700);
    expect(entryVariance(entry('DEBIT', -8500, -7000))).toBe(1500);
    expect(entryVariance(entry('INCOME', 240000, 235000))).toBe(-5000);
    expect(entryVariance(entry('DEBIT', -8500, -8500))).toBe(0);
  });
});

// Feature: plan-vs-actual-envelopes, Property 13: Cumulative variance sums the posted entries in the cycle
// **Validates: Requirements 6.6, 6.10**
describe('computeCumulativeVariance', () => {
  const dayStr = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
  const statuses: Entry['status'][] = ['PLANNED', 'PENDING', 'POSTED', 'SKIPPED'];

  const entryArb = fc.record({
    type: direction,
    est: magnitude,
    act: fc.option(magnitude, { nil: null }),
    status: fc.constantFrom(...statuses),
    postOffset: fc.integer({ min: 0, max: 120 }),
    actualOffset: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
  });

  const entriesArb = fc.array(entryArb, { maxLength: 25 }).map((items) =>
    items.map(
      (it, i): Entry => ({
        id: `e${String(i).padStart(3, '0')}`,
        accountId: 'a1',
        scheduleId: 'sched',
        postDate: dayStr(it.postOffset),
        shiftedPostDate: dayStr(it.postOffset),
        estimatedAmountCents: signedOf(it.type, it.est),
        actualAmountCents: it.act === null ? null : signedOf(it.type, it.act),
        status: it.status,
        entryType: it.type,
        actualDate: it.actualOffset === undefined ? undefined : dayStr(it.actualOffset),
      }),
    ),
  );

  const cycleArb = fc
    .tuple(fc.integer({ min: 0, max: 120 }), fc.integer({ min: 0, max: 60 }))
    .map(([start, len]) => ({ startDate: dayStr(start), endDate: dayStr(start + len) }));

  it('Property 13: includes exactly POSTED entries dated inside the cycle, and the total sums the rows', () => {
    fc.assert(
      fc.property(entriesArb, cycleArb, (entries, cycle) => {
        const result = computeCumulativeVariance(entries, cycle);

        const expected = entries.filter((e) => {
          const d = e.actualDate ?? e.postDate;
          return e.status === 'POSTED' && d >= cycle.startDate && d <= cycle.endDate;
        });

        expect(result.rows.map((r) => r.id).sort()).toEqual(expected.map((e) => e.id).sort());
        expect(result.totalCents).toBe(expected.reduce((sum, e) => sum + entryVariance(e), 0));
        expect(result.totalCents).toBe(result.rows.reduce((sum, r) => sum + r.varianceCents, 0));

        // Rows are sorted by actual date, then id.
        for (let i = 1; i < result.rows.length; i++) {
          const a = result.rows[i - 1];
          const b = result.rows[i];
          expect(a.actualDate < b.actualDate || (a.actualDate === b.actualDate && a.id <= b.id)).toBe(true);
        }
      }),
    );
  });

  it('Property 13: entries that are not POSTED never contribute', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const cycle = { startDate: dayStr(0), endDate: dayStr(200) };
        const nonPosted = entries.filter((e) => e.status !== 'POSTED');
        expect(computeCumulativeVariance(nonPosted, cycle)).toEqual({ rows: [], totalCents: 0 });
      }),
    );
  });

  it('falls back to postDate when actualDate is absent, with inclusive cycle bounds', () => {
    const base = entry('DEBIT', -8500, -9200);
    const e: Entry = { ...base, actualDate: undefined, postDate: '2026-03-10' };
    const cycle = (startDate: string, endDate: string) => ({ startDate, endDate });
    expect(computeCumulativeVariance([e], cycle('2026-03-10', '2026-03-10')).totalCents).toBe(-700);
    expect(computeCumulativeVariance([e], cycle('2026-03-11', '2026-03-20')).rows).toHaveLength(0);
    expect(computeCumulativeVariance([e], cycle('2026-03-01', '2026-03-09')).rows).toHaveLength(0);
  });
});
