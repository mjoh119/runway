import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/projection/dates';
import { run } from '../helpers/demo';

// Validates: Requirements 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
// expect.soft reports every failing date instead of stopping at the first.
describe.each([2026, 2028])('Demo data guarantees for every day of %i', (year) => {
  const days = Array.from({ length: year % 4 === 0 ? 366 : 365 }, (_, i) =>
    addDays(`${year}-01-01`, i),
  );

  it('holds on every Current_Date', () => {
    for (const today of days) {
      const { demo, projection } = run(today);
      const msg = `date ${today}`;
      const reason = projection.warnings.availableBalanceDifference?.reason ?? '';

      // threshold warning fires; runway is the hand-computed dip before payday
      expect.soft(projection.warnings.belowThreshold, msg).toBeDefined();
      expect.soft(projection.runway?.lowestBalanceCents, msg).toBe(13_000);
      expect.soft(projection.runway?.isBeforePayday, msg).toBe(true);

      // a hold is visible on day one
      const first = projection.balances[0];
      expect.soft(first.ledgerBalanceCents - first.availableBalanceCents, msg).toBe(10_000);
      expect.soft(reason, msg).toContain('deposit on hold');

      // a pending debit exists and is named in the reason
      expect
        .soft(
          demo.oneOffEntries.some((e) => e.status === 'PENDING' && e.entryType === 'DEBIT'),
          msg,
        )
        .toBe(true);
      expect.soft(reason, msg).toContain('$60 pending debit');

      // at least one entry is shifted
      expect
        .soft(projection.upcomingEntries.some((e) => e.shiftedPostDate !== e.postDate), msg)
        .toBe(true);

      // exactly one overdue entry
      expect.soft(projection.warnings.overdueEntries, msg).toHaveLength(1);
      expect
        .soft(projection.warnings.overdueEntries?.[0]?.id, msg)
        .toBe('entry-phone-overdue');
    }
  });
});
