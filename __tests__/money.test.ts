import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_CENTS, formatCentsPlain, parseMoney } from '@/lib/money';

describe('Money_Parser', () => {
  // Feature: plan-vs-actual-envelopes, Property 1: Money round trip
  it('Property 1: parseMoney(formatCentsPlain(c)) returns the same cents', () => {
    // **Validates: Requirements 1.7**
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CENTS }), (c) => {
        const result = parseMoney(formatCentsPlain(c));
        return result.ok && result.cents === c;
      }),
      { numRuns: 200 },
    );
  });

  // Feature: plan-vs-actual-envelopes, Property 2: Valid money text parses to exact cents
  it('Property 2: valid money text parses to dollars * 100 + fraction cents', () => {
    // **Validates: Requirements 1.1, 1.2**
    const digit = fc.constantFrom(...'0123456789'.split(''));
    const whitespace = fc
      .array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 3 })
      .map((a) => a.join(''));
    const wholeDigits = fc
      .array(digit, { minLength: 1, maxLength: 9 })
      .map((a) => a.join(''));
    const fraction = fc.option(
      fc.array(digit, { minLength: 1, maxLength: 2 }).map((a) => a.join('')),
      { nil: undefined },
    );

    fc.assert(
      fc.property(whitespace, wholeDigits, fraction, whitespace, (lead, whole, frac, trail) => {
        const expected = Number(whole) * 100 + Number((frac ?? '').padEnd(2, '0') || '0');
        fc.pre(expected >= 1 && expected <= MAX_CENTS);
        const text = `${lead}${whole}${frac === undefined ? '' : `.${frac}`}${trail}`;
        const result = parseMoney(text);
        return result.ok && result.cents === expected;
      }),
      { numRuns: 200 },
    );
  });

  // Feature: plan-vs-actual-envelopes, Property 3: Invalid money text is rejected with the right error and never rounded
  describe('Property 3: invalid money text', () => {
    // **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 7.5**
    const digit = fc.constantFrom(...'0123456789'.split(''));
    const digits = (min: number, max: number) =>
      fc.array(digit, { minLength: min, maxLength: max }).map((a) => a.join(''));
    const ws = fc
      .array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 3 })
      .map((a) => a.join(''));

    it('whitespace-only text is rejected as required', () => {
      fc.assert(
        fc.property(ws, (text) => {
          const r = parseMoney(text);
          return !r.ok && r.error === 'Enter an amount';
        }),
        { numRuns: 100 },
      );
    });

    it('three or more decimal digits are rejected, never rounded', () => {
      fc.assert(
        fc.property(digits(1, 9), digits(3, 6), (whole, frac) => {
          const r = parseMoney(`${whole}.${frac}`);
          return !r.ok && r.error === 'At most two decimal places are allowed';
        }),
        { numRuns: 200 },
      );
    });

    it('text outside the grammar is rejected as not valid', () => {
      const bad = fc
        .tuple(digits(0, 4), fc.constantFrom('$', '-', ',', 'e', 'x', '+', '%', '.'), digits(0, 4))
        .map(([a, c, b]) => `${a}${c}${b}`)
        .filter((t) => !/^\d+(\.\d{1,2})?$/.test(t.trim()) && !/^\d+\.\d{3,}$/.test(t.trim()) && t.trim() !== '');
      fc.assert(
        fc.property(bad, (text) => {
          const r = parseMoney(text);
          return !r.ok && r.error === 'That is not a valid amount';
        }),
        { numRuns: 200 },
      );
    });

    it('zero and values above the maximum are rejected as out of range', () => {
      fc.assert(
        fc.property(fc.integer({ min: MAX_CENTS + 1, max: 99_999_999_999 }), (c) => {
          const r = parseMoney(formatCentsPlain(c));
          return !r.ok && r.error.startsWith('Amount must be between $0.01');
        }),
        { numRuns: 100 },
      );
      for (const t of ['0', '0.00', '000', '0.0']) {
        const r = parseMoney(t);
        if (r.ok || !r.error.startsWith('Amount must be between $0.01')) {
          throw new Error(`expected range error for ${t}`);
        }
      }
    });

    it('examples', () => {
      expect(parseMoney('12.5')).toEqual({ ok: true, cents: 1250 });
      expect(parseMoney('0.99')).toEqual({ ok: true, cents: 99 });
      for (const t of ['5.', '.5', '1e3', '-5', '1,200', '$5']) {
        expect(parseMoney(t)).toEqual({ ok: false, error: 'That is not a valid amount' });
      }
      expect(parseMoney('1.234')).toEqual({ ok: false, error: 'At most two decimal places are allowed' });
    });

    it('allowZero accepts "0" and "0.00" and still rejects invalid text', () => {
      expect(parseMoney('0', { allowZero: true })).toEqual({ ok: true, cents: 0 });
      expect(parseMoney('0.00', { allowZero: true })).toEqual({ ok: true, cents: 0 });
      expect(parseMoney('-0', { allowZero: true }).ok).toBe(false);
    });
  });});
