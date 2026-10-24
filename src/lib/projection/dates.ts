/**
 * Pure UTC date-only helpers on 'YYYY-MM-DD' strings.
 *
 * All arithmetic goes through Date.UTC / getUTC* so results never depend on
 * the machine's time zone or DST. Never use local-time Date arithmetic or
 * toISOString() on local dates here.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  return ms;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Returns the date n days after (or before, if negative) the given date. */
export function addDays(date: string, n: number): string {
  const d = new Date(parse(date) + n * 86_400_000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** Day of week for the given date: 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(parse(date)).getUTCDay();
}

/** Number of days in a month. `month` is 0-indexed (0 = January), matching Date.UTC. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
