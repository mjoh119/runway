import { describe, expect, it } from 'vitest';
import { computePayCycles } from '../../src/lib/projection/engine';
import type { Entry } from '../../src/lib/projection/types';

function income(id: string, date: string, status: Entry['status'] = 'PLANNED'): Entry {
  return {
    id,
    accountId: 'a',
    scheduleId: null,
    postDate: date,
    shiftedPostDate: date,
    estimatedAmountCents: 100000,
    actualAmountCents: null,
    status,
    entryType: 'INCOME',
  };
}

describe('computePayCycles', () => {
  it('starts at currentDate and ends at projection end with no income', () => {
    expect(computePayCycles([], '2025-03-10', '2025-04-09')).toEqual([
      { startDate: '2025-03-10', endDate: '2025-04-09', incomeEntryId: null },
    ]);
  });

  it('produces three cycles for three biweekly paydays, without merging', () => {
    const entries = [income('p1', '2025-03-07', 'POSTED'), income('p2', '2025-03-21'), income('p3', '2025-04-04')];
    expect(computePayCycles(entries, '2025-03-10', '2025-04-20')).toEqual([
      { startDate: '2025-03-07', endDate: '2025-03-20', incomeEntryId: 'p1' },
      { startDate: '2025-03-21', endDate: '2025-04-03', incomeEntryId: 'p2' },
      { startDate: '2025-04-04', endDate: '2025-04-20', incomeEntryId: 'p3' },
    ]);
  });

  it('splits a cycle at a mid-cycle one-off income', () => {
    const entries = [income('p1', '2025-03-07'), income('oneoff', '2025-03-14'), income('p2', '2025-03-21')];
    const cycles = computePayCycles(entries, '2025-03-08', '2025-03-31');
    expect(cycles.map((c) => c.incomeEntryId)).toEqual(['p1', 'oneoff', 'p2']);
    expect(cycles[0].endDate).toBe('2025-03-13');
  });

  it('ignores skipped income and income past the end; does not mutate input', () => {
    const entries = [income('skip', '2025-03-15', 'SKIPPED'), income('late', '2025-05-01')];
    const copy = JSON.stringify(entries);
    expect(computePayCycles(entries, '2025-03-10', '2025-04-09')).toHaveLength(1);
    expect(JSON.stringify(entries)).toBe(copy);
  });
});
