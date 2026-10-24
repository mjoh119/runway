import { describe, expect, it } from 'vitest';
import { run } from '../helpers/demo';

describe('Demo data projection', () => {
  it('produces the hand-computed projection for 2026-03-11', () => {
    const { projection } = run('2026-03-11');
    const at = (d: string) => projection.balances.find((b) => b.date === d)!;

    expect(projection.runway).toMatchObject({
      lowestBalanceCents: 13_000,
      lowestBalanceDate: '2026-03-16',
      isBeforePayday: true,
    });

    expect(projection.warnings.belowThreshold).toEqual({
      thresholdCents: 20_000,
      lowestBalanceCents: 13_000,
      date: '2026-03-16',
    });

    expect(at('2026-03-11')).toMatchObject({ availableBalanceCents: 142_500, ledgerBalanceCents: 152_500 });
    expect(at('2026-03-12')).toMatchObject({ availableBalanceCents: 26_500, ledgerBalanceCents: 26_500 });
    expect(at('2026-03-13')).toMatchObject({ availableBalanceCents: 18_000, ledgerBalanceCents: 18_000 });
    expect(at('2026-03-15')).toMatchObject({ availableBalanceCents: 18_000, ledgerBalanceCents: 18_000 });
    expect(at('2026-03-16')).toMatchObject({ availableBalanceCents: 13_000, ledgerBalanceCents: 13_000 });
    expect(at('2026-03-23')).toMatchObject({ availableBalanceCents: 13_000, ledgerBalanceCents: 13_000 });
    expect(at('2026-03-24')).toMatchObject({ availableBalanceCents: 253_000, ledgerBalanceCents: 253_000 });

    const weekend = projection.upcomingEntries.find((e) => e.id === 'entry-weekend')!;
    expect(weekend.postDate).toBe('2026-03-14');
    expect(weekend.shiftedPostDate).toBe('2026-03-16');

    // Second-cycle bills (after the 03-24 paycheck): Streaming $15.49 (+17 days = Sat 03-28,
    // shifted to Mon 03-30) and Car insurance $142.00 (+21 days = Wed 04-01).
    expect(at('2026-03-27').availableBalanceCents).toBe(253_000);
    expect(at('2026-03-30').availableBalanceCents).toBe(253_000 - 1_549);
    expect(at('2026-04-01').availableBalanceCents).toBe(253_000 - 1_549 - 14_200);
    expect(
      projection.upcomingEntries.filter((e) => e.scheduleId !== null && e.scheduleId !== 'schedule-paycheck').map((e) => e.description),
    ).toEqual(['Streaming', 'Car insurance']);
    expect(projection.warnings.overdueEntries!.map((e) => e.id)).toEqual(['entry-phone-overdue']);
    expect(projection.warnings.availableBalanceDifference!.reason).toBe(
      '$60 pending debit and $40 deposit on hold until Mar 12',
    );

    // The first cycle starts 2026-03-10, not the design's 03-11: the demo's posted held
    // deposit (INCOME, dated 03-10) is an income entry on/before the current date (Req 5.6).
    expect(projection.payCycles).toHaveLength(2);
    expect(projection.payCycles[0]).toMatchObject({ startDate: '2026-03-10', endDate: '2026-03-23' });
    expect(projection.payCycles[1]).toMatchObject({ startDate: '2026-03-24', endDate: '2026-04-06' });
  });
});
