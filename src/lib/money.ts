/**
 * Money_Parser: converts user-typed money text to integer cents.
 * Pure module. Integer arithmetic only; never rounds, never uses floats.
 */

export const MAX_CENTS = 999_999_999;

export type MoneyParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

export interface ParseMoneyOptions {
  /** Settings threshold allows 0. All other amounts require at least 1 cent. */
  allowZero?: boolean;
}

const TOO_MANY_DECIMALS = /^\d+\.\d{3,}$/;
const VALID_GRAMMAR = /^\d+(\.\d{1,2})?$/;
const MAX_WHOLE_DIGITS = 9;

/** Parse text like "12.5" into 1250 cents. Precedence: trim, required, decimals, grammar, length, range. */
export function parseMoney(
  text: string,
  options: ParseMoneyOptions = {},
): MoneyParseResult {
  const allowZero = options.allowZero === true;
  const rangeError = {
    ok: false as const,
    error: allowZero
      ? 'Amount must be between $0.00 and $9,999,999.99 (0 to 999,999,999 cents)'
      : 'Amount must be between $0.01 and $9,999,999.99 (1 to 999,999,999 cents)',
  };

  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter an amount' };
  }
  if (TOO_MANY_DECIMALS.test(trimmed)) {
    return { ok: false, error: 'At most two decimal places are allowed' };
  }
  if (!VALID_GRAMMAR.test(trimmed)) {
    return { ok: false, error: 'That is not a valid amount' };
  }

  const [wholeRaw, fracRaw = ''] = trimmed.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  if (whole.length > MAX_WHOLE_DIGITS) {
    return rangeError;
  }

  const cents = Number(whole) * 100 + Number(fracRaw.padEnd(2, '0'));
  if (cents < (allowZero ? 0 : 1) || cents > MAX_CENTS) {
    return rangeError;
  }
  return { ok: true, cents };
}

/** 1205 -> "12.05". Integer math only. Inverse of parseMoney for 1..MAX_CENTS. */
export function formatCentsPlain(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${negative ? '-' : ''}${whole}.${frac < 10 ? '0' : ''}${frac}`;
}
