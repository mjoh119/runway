import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateDemoData } from '../../src/sources/fake-source';
import { collectScheduledIncomeDates } from '../../src/lib/envelopes/income-dates';
import { periodContaining, precedingPeriod } from '../../src/lib/envelopes/period';
import type { EnvelopePeriod } from '../../src/lib/envelopes/types';
import { computeEnvelopeTotals } from '../../src/lib/envelopes/totals';
import { buildEnvelopeCommitments } from '../../src/lib/envelopes/commitments';
import { projectCashFlow } from '../../src/lib/projection/engine';

const DAY_MS = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const shift = (date: string, days: number) => toIso(utcMs(date) + days * DAY_MS);

// Dates from 2000-01-01 to 2100-12-31, including leap days and year boundaries.
const anyDate = fc
  .integer({ min: utcMs('2000-01-01') / DAY_MS, max: utcMs('2100-12-31') / DAY_MS })
  .map((days) => toIso(days * DAY_MS));

const inPeriod = (date: string, p: EnvelopePeriod) => date >= p.start && date <= p.end;

describe('generateDemoData envelopes', () => {
  it('Property 26: demo seed covers each reset period with relative dates', () => {
    // **Validates: Requirements 15.6, 15.8**
    fc.assert(
      fc.property(anyDate, (today) => {
        const data = generateDemoData(today);

        // Three envelopes with the specified shape.
        expect(data.envelopes.map((e) => [e.name, e.resetPeriod, e.budgetCents])).toEqual([
          ['Groceries', 'WEEKLY', 6_000],
          ['Dining out', 'EACH_PAY_CYCLE', 4_500],
          ['Fun money', 'MONTHLY', 4_000],
        ]);

        const incomeDates = collectScheduledIncomeDates({
          schedules: data.schedules,
          occurrenceRecords: [],
          holidays: [],
          from: shift(today, -800),
          to: shift(today, 800),
        });

        // No line item is dated in the future, and every item belongs to an envelope.
        const envelopeIds = new Set(data.envelopes.map((e) => e.id));
        for (const item of data.lineItems) {
          expect(item.purchaseDate <= today).toBe(true);
          expect(envelopeIds.has(item.envelopeId)).toBe(true);
        }

        for (const envelope of data.envelopes) {
          const items = data.lineItems.filter((i) => i.envelopeId === envelope.id);
          const current = periodContaining(envelope.resetPeriod, today, incomeDates, today);

          // At least one item in the current period.
          expect(items.some((i) => inPeriod(i.purchaseDate, current))).toBe(true);

          // WEEKLY and MONTHLY also have an item in the preceding period.
          if (envelope.resetPeriod === 'WEEKLY' || envelope.resetPeriod === 'MONTHLY') {
            const preceding = precedingPeriod(envelope.resetPeriod, current, incomeDates);
            expect(preceding).not.toBeNull();
            expect(items.some((i) => inPeriod(i.purchaseDate, preceding!))).toBe(true);
          }
        }
      }),
    );
  });

  it('shifting the input date shifts every line item date by the same amount', () => {
    // **Validates: Requirements 15.8**
    // Weekly items sit at fixed offsets from today, so a +7 day shift moves them by 7 days.
    fc.assert(
      fc.property(anyDate, (today) => {
        const a = generateDemoData(today);
        const b = generateDemoData(shift(today, 7));
        const groceries = (d: typeof a) =>
          d.lineItems.filter((i) => i.envelopeId === 'envelope-groceries').map((i) => i.purchaseDate);
        expect(groceries(b)).toEqual(groceries(a).map((d) => shift(d, 7)));
      }),
    );
  });
});

describe('generateDemoData runway', () => {
  it('Property 27: seeded runway stays below the threshold', () => {
    // **Validates: Requirements 15.7**
    const holidayVariants = fc.constantFrom<number[][]>([], [2], [1, 8, 15], [3, 4, 10, 17, 24]);

    fc.assert(
      fc.property(anyDate, holidayVariants, (today, holidayOffsets) => {
        const data = generateDemoData(today);
        const { lowBalanceThresholdCents, projectionHorizonDays } = data.workspaceSettings;
        const holidays = holidayOffsets.map((n) => shift(today, n));

        const incomeDates = collectScheduledIncomeDates({
          schedules: data.schedules,
          occurrenceRecords: [],
          holidays,
          from: shift(today, -90),
          to: shift(today, projectionHorizonDays + 60),
        });

        const envelopes = data.envelopes.map((e) => {
          const period = periodContaining(e.resetPeriod, today, incomeDates, today);
          const items = data.lineItems
            .filter((i) => i.envelopeId === e.id)
            .map((i, idx) => ({ id: `${e.id}-${idx}`, ...i }));
          const { leftCents } = computeEnvelopeTotals(e.budgetCents, items, period);
          return { id: e.id, name: e.name, period, leftCents };
        });

        const output = projectCashFlow({
          accounts: data.accounts.map((a) => ({
            id: a.id,
            isPrimary: a.isPrimary,
            ledgerBalanceCents: a.ledgerBalanceCents,
            availableBalanceCents: a.availableBalanceCents,
          })),
          schedules: data.schedules,
          oneOffEntries: data.oneOffEntries,
          holidays,
          currentDate: today,
          projectionHorizonDays,
          lowBalanceThresholdCents,
          envelopeCommitments: buildEnvelopeCommitments(envelopes, today),
        });

        expect(output.runway).not.toBeNull();
        const lowest = output.runway!.lowestBalanceCents;
        expect(lowest).toBeGreaterThanOrEqual(0);
        expect(lowest).toBeLessThan(lowBalanceThresholdCents);
        expect(lowBalanceThresholdCents).toBe(20_000);
        expect(output.warnings.belowThreshold).toBeDefined();
      }),
    );
  });
});