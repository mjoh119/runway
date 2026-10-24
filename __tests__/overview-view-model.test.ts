import { describe, expect, it } from 'vitest';
import {
  buildCycleSummary,
  buildOverviewViewModel,
  buildUpcomingGroups,
  findNextPayday,
  type OverviewProjection,
} from '@/lib/overview-view-model';
import type { Entry } from '@/lib/projection/types';
import { run } from './helpers/demo';

function entry(over: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    accountId: 'a',
    scheduleId: null,
    postDate: '2026-10-23',
    shiftedPostDate: '2026-10-23',
    estimatedAmountCents: -1_000,
    actualAmountCents: null,
    status: 'PLANNED',
    entryType: 'DEBIT',
    description: over.id,
    ...over,
  };
}

function proj(over: Partial<OverviewProjection>): OverviewProjection {
  return { balances: [], runway: null, payCycles: [], upcomingEntries: [], warnings: {}, ...over };
}

describe('overview view model on the demo data (today = Fri 2026-10-23)', () => {
  const { projection } = run('2026-10-23');
  const vm = buildOverviewViewModel(projection, '2026-10-23');

  it('derives payday, balances and days until payday', () => {
    expect(projection.runway).toMatchObject({ lowestBalanceCents: 13_000, isBeforePayday: true });
    expect(vm.nextPayday).toEqual({ date: '2026-11-05', amountCents: 240_000, name: 'Biweekly paycheck' });
    expect(vm.daysUntilPayday).toBe(13);
    // balances[0] already includes the overdue phone bill (-7,500) counted on today.
    expect(vm.availableNowCents).toBe(142_500);
    expect(vm.ledgerNowCents).toBe(152_500);
  });

  it('summarises the current cycle (hand-computed)', () => {
    // Overdue phone 7,500 + rent 120,000 + electric 8,500 + gym 5,000 + pending grocery 6,000.
    expect(vm.cycleSummary).toEqual({
      startDate: '2026-10-22',
      endDate: '2026-11-04',
      plannedOutCents: 147_000,
      plannedInCents: 0,
      overdueCount: 1,
    });
  });

  it('groups upcoming rows: overdue, then by shifted date, skipping posted entries', () => {
    expect(vm.upcomingGroups.map((g) => g.label)).toEqual([
      'Overdue',
      'Mon, Oct 26',
      'Thu, Nov 5',
      'Mon, Nov 9',
      'Fri, Nov 13',
    ]);
    expect(vm.upcomingGroups[0].rows).toEqual([
      {
        id: 'entry-phone-overdue',
        description: 'Phone bill',
        amountCents: -7_500,
        status: 'overdue',
        shifted: { originalDate: '2026-10-18', text: 'Moved from Sun Oct 18' },
        dueText: 'Due Mon, Oct 19',
      },
    ]);
    const oct26 = vm.upcomingGroups[1].rows;
    expect(oct26.map((r) => r.description)).toEqual(['Electric', 'Grocery store', 'Rent', 'Gym membership']);
    expect(oct26.find((r) => r.description === 'Grocery store')).toMatchObject({ status: 'pending', amountCents: -6_000 });
    expect(oct26.find((r) => r.description === 'Rent')?.shifted).toEqual({
      originalDate: '2026-10-24',
      text: 'Moved from Sat Oct 24',
    });
    expect(vm.upcomingGroups[2].rows[0]).toMatchObject({ description: 'Biweekly paycheck', amountCents: 240_000, status: null, shifted: null });
    expect(vm.upcomingGroups[3].rows[0]).toMatchObject({ description: 'Streaming', amountCents: -1_549 });
    expect(vm.upcomingGroups[4].rows[0]).toMatchObject({ description: 'Car insurance', amountCents: -14_200 });
    const ids = vm.upcomingGroups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).not.toContain('entry-posted-held');
  });

  it('lists ledger/available difference items from real entries', () => {
    expect(projection.warnings.availableBalanceDifference?.items).toEqual([
      { description: 'Grocery store', amountCents: 6_000, kind: 'Pending' },
      { description: 'Freelance deposit', amountCents: 4_000, kind: 'On hold', holdReleaseDate: '2026-10-24' },
    ]);
    expect(vm.ledgerDifferenceItems.map((i) => [i.text, i.kind])).toEqual([
      ['$60.00 pending at Grocery store', 'Pending'],
      ['$40.00 deposit on hold until Sat Oct 24', 'On hold'],
    ]);
  });
});

describe('findNextPayday', () => {
  it('uses the earliest non-skipped income after today at actual ?? estimate (absolute)', () => {
    const entries = [
      entry({ id: 'bill', shiftedPostDate: '2026-10-25' }),
      entry({ id: 'skipped', entryType: 'INCOME', estimatedAmountCents: 9_900, shiftedPostDate: '2026-10-26', status: 'SKIPPED' }),
      entry({ id: 'today-income', entryType: 'INCOME', estimatedAmountCents: 500, shiftedPostDate: '2026-10-23' }),
      entry({ id: 'pay', entryType: 'INCOME', estimatedAmountCents: 100_000, actualAmountCents: 123_456, shiftedPostDate: '2026-10-30', description: 'Retainer' }),
    ];
    expect(findNextPayday(entries, '2026-10-23')).toEqual({ date: '2026-10-30', amountCents: 123_456, name: 'Retainer' });
  });

  it('is null with no future income, and daysUntilPayday is null when runway is horizon-bound', () => {
    expect(findNextPayday([entry({ id: 'bill' })], '2026-10-23')).toBeNull();
    const vm = buildOverviewViewModel(
      proj({
        runway: { lowestBalanceCents: 1, lowestBalanceDate: '2026-10-23', isBeforePayday: false, projectionEndDate: '2026-11-22' },
        upcomingEntries: [entry({ id: 'pay', entryType: 'INCOME', estimatedAmountCents: 5_000, shiftedPostDate: '2026-11-30' })],
      }),
      '2026-10-23',
    );
    expect(vm.daysUntilPayday).toBeNull();
    expect(vm.nextPayday?.date).toBe('2026-11-30');
  });
});

describe('buildCycleSummary', () => {
  it('counts planned/pending in-cycle entries and overdue; ignores posted, skipped, and later cycles', () => {
    const overdue = entry({ id: 'od', shiftedPostDate: '2026-10-20', estimatedAmountCents: -2_500 });
    const summary = buildCycleSummary(
      proj({
        payCycles: [{ startDate: '2026-10-15', endDate: '2026-10-29', incomeEntryId: 'x' }],
        warnings: { overdueEntries: [overdue] },
        upcomingEntries: [
          entry({ id: 'a', estimatedAmountCents: -10_000, actualAmountCents: -10_250 }), // 10,250 (actual wins)
          entry({ id: 'b', status: 'PENDING', estimatedAmountCents: -300, shiftedPostDate: '2026-10-29' }),
          entry({ id: 'c', entryType: 'INCOME', estimatedAmountCents: 7_000, shiftedPostDate: '2026-10-24' }),
          entry({ id: 'posted', status: 'POSTED', estimatedAmountCents: -999 }),
          entry({ id: 'skip', status: 'SKIPPED', estimatedAmountCents: -999 }),
          entry({ id: 'later', estimatedAmountCents: -5_000, shiftedPostDate: '2026-10-30' }),
        ],
      }),
      '2026-10-23',
    );
    expect(summary).toEqual({
      startDate: '2026-10-15',
      endDate: '2026-10-29',
      plannedOutCents: 2_500 + 10_250 + 300,
      plannedInCents: 7_000,
      overdueCount: 1,
    });
  });

  it('is null when there are no cycles', () => {
    expect(buildCycleSummary(proj({}), '2026-10-23')).toBeNull();
  });
});

describe('buildUpcomingGroups', () => {
  it('adds a Today group and names the holiday for holiday shifts', () => {
    const groups = buildUpcomingGroups(
      proj({
        upcomingEntries: [
          // Mon Jan 19 2026 is MLK Day; the debit settles Tue Jan 20.
          entry({ id: 'h', postDate: '2026-01-19', shiftedPostDate: '2026-01-20', description: 'Loan' }),
          entry({ id: 't', postDate: '2026-01-16', shiftedPostDate: '2026-01-16', description: 'Water' }),
        ],
      }),
      '2026-01-16',
    );
    expect(groups.map((g) => g.label)).toEqual(['Today · Fri, Jan 16', 'Tue, Jan 20']);
    expect(groups[1].rows[0].shifted).toEqual({ originalDate: '2026-01-19', text: 'Moved from Mon Jan 19, MLK Day' });
  });

  it('returns no groups when nothing is open', () => {
    expect(buildUpcomingGroups(proj({}), '2026-10-23')).toEqual([]);
  });
});
