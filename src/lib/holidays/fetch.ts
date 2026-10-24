/**
 * Holiday fetch (I/O). Lives outside the projection engine, which receives
 * the resulting list as an argument.
 */

import { applyObservanceRules, generateFederalHolidays } from './generator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fetch nationwide US holidays for a calendar year from Nager.Date.
 * Cached by the Next.js fetch cache (7 days). On any network error, non-OK
 * status, timeout, or empty/malformed result, falls back to the rule-based
 * Federal Reserve generator. Returns 'YYYY-MM-DD' strings.
 */
export async function fetchHolidays(year: number): Promise<string[]> {
  try {
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/US`,
      {
        next: { revalidate: 604800 }, // 7 days
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty or invalid response');
    }

    const holidays: string[] = [];
    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        throw new Error('Malformed holiday entry');
      }
      const { date, global } = item as { date?: unknown; global?: unknown };
      if (typeof date !== 'string' || !ISO_DATE.test(date)) {
        throw new Error('Malformed holiday date');
      }
      if (global === true) {
        holidays.push(applyObservanceRules(date));
      }
    }

    if (holidays.length === 0) {
      throw new Error('No nationwide holidays in response');
    }

    return holidays;
  } catch (error) {
    console.warn(
      `Holiday fetch failed for ${year}, using rule-based generator:`,
      error,
    );
    return generateFederalHolidays(year);
  }
}
