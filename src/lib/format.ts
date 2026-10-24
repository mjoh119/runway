/**
 * Pure formatting helpers shared by the projection engine and the UI.
 * Integer math only for money; fixed month table so output never depends on locale.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Insert thousands separators into a string of digits. */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/**
 * Format integer cents as dollars and cents, e.g. 13000 -> "$130.00".
 * Negative values render as "-$5.50".
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatCents expects integer cents, got ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs - dollars * 100;
  const body = `$${groupThousands(String(dollars))}.${remainder < 10 ? '0' : ''}${remainder}`;
  return negative ? `-${body}` : body;
}

/**
 * Format integer cents as whole dollars, e.g. 6000 -> "$60".
 * Intended for reason lines where cents are noise. Any sub-dollar remainder is
 * truncated toward zero (so 6099 -> "$60"); negatives render as "-$60".
 */
export function formatWholeDollars(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatWholeDollars expects integer cents, got ${cents}`);
  }
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const body = `$${groupThousands(String(dollars))}`;
  return cents < 0 && dollars > 0 ? `-${body}` : body;
}

/** Format a 'YYYY-MM-DD' date as "Mar 12". */
export function formatMonthDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`formatMonthDay expects 'YYYY-MM-DD', got '${date}'`);
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in date '${date}'`);
  }
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

/**
 * Format integer cents with an explicit sign for display lists, using a real minus
 * sign (U+2212): -7500 -> "−$75.00"; with `showPlus`, 240000 -> "+$2,400.00".
 * Zero never gets a sign.
 */
export function formatSignedCents(cents: number, showPlus = false): string {
  const body = formatCents(Math.abs(cents));
  if (cents < 0) return `\u2212${body}`;
  return showPlus && cents > 0 ? `+${body}` : body;
}
