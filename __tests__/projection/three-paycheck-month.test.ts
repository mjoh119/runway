import { describe, expect, it } from 'vitest';
import { computePayCycles, generateEntries } from '@/lib/projection/engine';
import type { Entry, Schedule } from '@/lib/projection/types';

// Validates: Requirements 5.1, 5.3

const CURRENT = '2026-01-02';
const END = '2026-02-27';
const HOLIDAYS = ['2026-01-01', '2026-01-19', '2026-02-16'];

function income(id: string, date: string): Entry {
  return {
    id,
    accountId: 'acct-1',
    scheduleId: null,
    postDate: date,
    shiftedPostDate: date,
    estimatedAmountCents: 200000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'INCOME',
  };
}

const EXPECTED = [
  { startDate: '2026-01-02', endDate: '2026-01-15' },
  { startDate: '2026-01-16', endDate: '2026-01-29' },
  { startDate: '2026-01-30', endDate: '2026-02-12' },
  { startDate: '2026-02-13', endDate: END },
];

describe('three-paycheck month (biweekly income)', () => {
  it('computes cycles from explicit income entries', () => {
    const entries = [
      income('a', '2026-01-02'),
      income('b', '2026-01-16'),
      income('c', '2026-01-30'),
      income('d', '2026-02-13'),
    ];
    const cycles = computePayCycles(entries, CURRENT, END);
    expect(cycles.map(({ startDate, endDate }) => ({ startDate, endDate }))).toEqual(EXPECTED);
    expect(cycles.map((c) => c.incomeEntryId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('computes the same cycles from a WEEKS/2 INCOME schedule', () => {
    const schedule: Schedule = {
      id: 'pay',
      name: 'Paycheck',
      accountId: 'acct-1',
      intervalType: 'WEEKS',
      intervalValue: 2,
      daysOfMonth: [],
      startDate: '2026-01-02',
      estimatedAmountCents: 200000,
      entryType: 'INCOME',
    };
    const entries = generateEntries(schedule, CURRENT, END, HOLIDAYS);
    expect(entries.map((e) => e.shiftedPostDate)).toEqual([
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
      '2026-02-27',
    ]);

    const cycles = computePayCycles(entries, CURRENT, END);
    // Fifth paycheck on 02-27 starts a fifth cycle; first four match the spec.
    expect(cycles).toHaveLength(5);
    expect(
      cycles.slice(0, 3).map(({ startDate, endDate }) => ({ startDate, endDate })),
    ).toEqual(EXPECTED.slice(0, 3));
    expect(cycles[3]).toMatchObject({ startDate: '2026-02-13', endDate: '2026-02-26' });
    expect(cycles[4]).toMatchObject({ startDate: '2026-02-27', endDate: END });
  });
});
