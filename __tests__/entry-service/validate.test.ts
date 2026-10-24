import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateEnvelopeInput, validateSettings } from '../../src/lib/entry-service/validate';
import { formatCentsPlain, MAX_CENTS } from '../../src/lib/money';

// ASCII-only names keep toLowerCase() comparisons free of locale quirks.
const WS = [' ', '\t', '\n'];
const padArb = fc.array(fc.constantFrom(...WS), { maxLength: 3 }).map((a) => a.join(''));
const coreArb = fc
  .string({ unit: fc.constantFrom(...'abcXYZ019 -_&'.split('')), minLength: 1, maxLength: 60 })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1);

const base = { budgetText: '100.00', resetPeriod: 'WEEKLY' };

function swapCase(s: string, flips: boolean[]): string {
  return [...s]
    .map((c, i) => (flips[i % Math.max(flips.length, 1)] ? c.toUpperCase() : c.toLowerCase()))
    .join('');
}

describe('Property 14: Envelope names are validated and unique ignoring case', () => {
  /** **Validates: Requirements 7.3, 7.4** */
  it('rejects names that are empty after trimming', () => {
    fc.assert(
      fc.property(padArb, fc.array(coreArb, { maxLength: 5 }), (name, others) => {
        const r = validateEnvelopeInput({ ...base, name }, others);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('name');
      }),
    );
  });

  /** **Validates: Requirements 7.3, 7.4** */
  it('rejects names longer than 60 characters after trimming', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'abcdef'.split('')), minLength: 61, maxLength: 120 }),
        padArb,
        (core, pad) => {
          const r = validateEnvelopeInput({ ...base, name: pad + core + pad }, []);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.field).toBe('name');
        },
      ),
    );
  });

  /** **Validates: Requirements 7.3, 7.4** */
  it('rejects a name equal to another envelope name ignoring case', () => {
    fc.assert(
      fc.property(
        coreArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        padArb,
        fc.array(coreArb, { maxLength: 4 }),
        (core, flips, pad, extras) => {
          const variant = swapCase(core, flips);
          const r = validateEnvelopeInput({ ...base, name: pad + variant + pad }, [...extras, core]);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.field).toBe('name');
        },
      ),
    );
  });

  /** **Validates: Requirements 7.3, 7.4** */
  it('accepts every other name and stores the trimmed name', () => {
    fc.assert(
      fc.property(coreArb, padArb, padArb, fc.array(coreArb, { maxLength: 5 }), (core, lead, trail, others) => {
        const distinct = others.filter((o) => o.toLowerCase() !== core.toLowerCase());
        const r = validateEnvelopeInput({ ...base, name: lead + core + trail }, distinct);
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.value.name).toBe(core);
          expect(r.value.nameKey).toBe(core.toLowerCase());
        }
      }),
    );
  });
});

describe('Property 24: Settings validation', () => {
  const horizonOk = fc.integer({ min: 1, max: 365 });

  /** **Validates: Requirements 12.2, 12.3, 12.4, 12.5** */
  it('accepts a blank threshold as null and a whole-number horizon from 1 to 365', () => {
    fc.assert(
      fc.property(padArb, horizonOk, padArb, (blank, h, pad) => {
        const r = validateSettings({ thresholdText: blank, horizonText: pad + String(h) + pad });
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.value.lowBalanceThresholdCents).toBeNull();
          expect(r.value.projectionHorizonDays).toBe(h);
        }
      }),
    );
  });

  /** **Validates: Requirements 12.2, 12.3, 12.4, 12.5** */
  it('accepts any threshold from 0 to the maximum and returns its cents', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_CENTS }), horizonOk, (cents, h) => {
        const r = validateSettings({ thresholdText: formatCentsPlain(cents), horizonText: String(h) });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.lowBalanceThresholdCents).toBe(cents);
      }),
    );
  });

  /** **Validates: Requirements 12.2, 12.3, 12.4, 12.5** */
  it('rejects a horizon that is not a whole number from 1 to 365', () => {
    const badHorizon = fc.oneof(
      fc.integer({ min: -1000, max: 0 }).map(String),
      fc.integer({ min: 366, max: 100000 }).map(String),
      fc.integer({ min: 1, max: 365 }).map((n) => `${n}.5`),
      fc.constantFrom('', '  ', 'abc', '1e2', '-5', '+7', '12 3'),
    );
    fc.assert(
      fc.property(badHorizon, (horizonText) => {
        const r = validateSettings({ thresholdText: '', horizonText });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('horizon');
      }),
    );
  });

  /** **Validates: Requirements 12.2, 12.3, 12.4, 12.5** */
  it('rejects an invalid non-blank threshold on the threshold field', () => {
    const badThreshold = fc.constantFrom('abc', '-5', '1.234', '$5', '1,000', '1e3', '10000000.00');
    fc.assert(
      fc.property(badThreshold, horizonOk, (thresholdText, h) => {
        const r = validateSettings({ thresholdText, horizonText: String(h) });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.field).toBe('threshold');
      }),
    );
  });
});
