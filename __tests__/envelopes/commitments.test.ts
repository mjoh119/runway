import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildEnvelopeCommitments } from '../../src/lib/envelopes/commitments';
import { buildEnvelopeCardView } from '../../src/lib/envelopes/view-model';

const DAY_MS = 86_400_000;
const BASE_DAY = Date.parse('2020-01-01T00:00:00Z') / DAY_MS;
const toIso = (dayIndex: number) => new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

const dayOffset = fc.integer({ min: 0, max: 1100 });
const envelopeArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  startOff: dayOffset,
  len: fc.integer({ min: 0, max: 60 }),
  // Weighted so zero-left envelopes appear often.
  leftCents: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 999_999_999 })),
});

describe('buildEnvelopeCommitments', () => {
  it('Property 20: commitments exist exactly for envelopes with money left', () => {
    // **Validates: Requirements 9.1, 9.2**
    fc.assert(
      fc.property(fc.array(envelopeArb, { maxLength: 10 }), dayOffset, (raw, todayOff) => {
        const today = toIso(BASE_DAY + todayOff);
        const envelopes = raw.map((e) => ({
          id: e.id,
          name: e.name,
          period: { start: toIso(BASE_DAY + e.startOff), end: toIso(BASE_DAY + e.startOff + e.len) },
          leftCents: e.leftCents,
        }));
        const result = buildEnvelopeCommitments(envelopes, today);

        const withLeft = envelopes.filter((e) => e.leftCents > 0);
        expect(result).toHaveLength(withLeft.length);
        for (const env of envelopes) {
          const matches = result.filter((c) => c.envelopeId === env.id);
          if (env.leftCents === 0) {
            expect(matches).toHaveLength(0);
          } else {
            expect(matches).toHaveLength(1);
            expect(matches[0].amountCents).toBe(env.leftCents);
            const startOff = raw.find((r) => r.id === env.id)!.startOff;
            expect(matches[0].date).toBe(toIso(BASE_DAY + Math.max(startOff, todayOff)));
          }
        }
      }),
    );
  });

  it('runwayImpactCents equals overageCents on the card view', () => {
    // **Validates: Requirements 9.1, 9.2**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 500_000 }), { maxLength: 8 }),
        (budgetCents, amounts) => {
          const today = '2024-03-13';
          const view = buildEnvelopeCardView({
            envelope: { id: 'e1', name: 'Food', resetPeriod: 'MONTHLY', budgetCents },
            lineItems: amounts.map((a, i) => ({ id: `li${i}`, amountCents: a, purchaseDate: today })),
            incomeDates: [],
            today,
          });
          expect(view.runwayImpactCents).toBe(view.overageCents);
          expect(view.overageCents).toBe(Math.max(0, view.spentCents - budgetCents));
        },
      ),
    );
  });
});
