import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateDemoData } from '@/sources/fake-source';
import { addDays, dayOfWeek } from '@/lib/projection/dates';

// Feature: projection-engine-cycle-view, Property 41: Demo data relative dates
// **Validates: Requirements 15.8**

const REFERENCE = '2025-01-01';
const WEEKEND_ID = 'entry-weekend';

function diffDays(from: string, to: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(to) - p(from)) / 86_400_000);
}

/** Collect every date in the demo data as `label -> offset from currentDate`. */
function dateOffsets(currentDate: string, skipWeekend: boolean): Record<string, number> {
  const data = generateDemoData(currentDate);
  const out: Record<string, number> = {};
  for (const s of data.schedules) {
    out[`schedule:${s.id}:startDate`] = diffDays(currentDate, s.startDate);
  }
  for (const e of data.oneOffEntries) {
    if (skipWeekend && e.id === WEEKEND_ID) continue;
    out[`entry:${e.id}:postDate`] = diffDays(currentDate, e.postDate);
    out[`entry:${e.id}:shiftedPostDate`] = diffDays(currentDate, e.shiftedPostDate);
    if (e.holdReleaseDate) {
      out[`entry:${e.id}:holdReleaseDate`] = diffDays(currentDate, e.holdReleaseDate);
    }
  }
  return out;
}

const currentDateArb = fc
  .integer({ min: 0, max: diffDays('2020-01-01', '2035-12-31') })
  .map((n) => addDays('2020-01-01', n));

describe('Property 41: Demo data relative dates', () => {
  const reference = dateOffsets(REFERENCE, true);

  it('shifts every date by the same fixed offset as the reference date', () => {
    fc.assert(
      fc.property(currentDateArb, (currentDate) => {
        expect(dateOffsets(currentDate, true)).toEqual(reference);
      }),
      { numRuns: 100 },
    );
  });

  it('anchors the weekend debit to a Saturday within one week of the current date', () => {
    fc.assert(
      fc.property(currentDateArb, (currentDate) => {
        const weekend = generateDemoData(currentDate).oneOffEntries.find(
          (e) => e.id === WEEKEND_ID,
        )!;
        expect(dayOfWeek(weekend.postDate)).toBe(6);
        expect(weekend.shiftedPostDate).toBe(weekend.postDate);
        const offset = diffDays(currentDate, weekend.postDate);
        // Implementation picks the next Saturday strictly after currentDate (1..7)
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(7);
      }),
      { numRuns: 100 },
    );
  });
});
