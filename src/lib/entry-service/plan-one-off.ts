import { isValidDate } from '../projection/dates';
import { postedOneOffBalanceDelta, type BalanceDelta } from './balance-delta';
import { ServiceError, type Result } from './errors';

export interface OneOffInput {
  /** Validated here, so any string may arrive. Accepts 'debit' | 'income' (any case). */
  direction: string;
  amountCents: number;
  date: string;
  description?: string;
  alreadyHappened: boolean;
  today: string;
}

export interface OneOffPlan {
  entryType: 'INCOME' | 'DEBIT';
  status: 'PLANNED' | 'POSTED';
  postDate: string;
  /** Signed by direction. */
  estimatedAmountCents: number;
  /** Equals the estimate for POSTED, null for PLANNED. */
  actualAmountCents: number | null;
  /** Equals date for POSTED, null for PLANNED. */
  actualDate: string | null;
  /** Zero for PLANNED. */
  balanceDelta: BalanceDelta;
}

function fail(message: string, field: string): Result<OneOffPlan> {
  return { ok: false, error: new ServiceError('VALIDATION', message, field) };
}

/**
 * Pure plan for a one-off entry. Error order: direction, date, future actual,
 * planned-in-the-past.
 */
export function planOneOff(input: OneOffInput): Result<OneOffPlan> {
  const dir = input.direction.toLowerCase();
  if (dir !== 'debit' && dir !== 'income') {
    return fail('Direction must be debit or income', 'direction');
  }
  if (!isValidDate(input.date)) {
    return fail('Enter a valid date', 'date');
  }
  if (input.alreadyHappened && input.date > input.today) {
    return fail('An actual cannot be dated in the future', 'date');
  }
  if (!input.alreadyHappened && input.date < input.today) {
    return fail('Planned entries need a date today or later', 'date');
  }

  const entryType = dir === 'income' ? 'INCOME' : 'DEBIT';
  const magnitude = Math.abs(input.amountCents);
  const signedAmount = entryType === 'INCOME' ? magnitude : -magnitude;

  if (input.alreadyHappened) {
    return {
      ok: true,
      value: {
        entryType,
        status: 'POSTED',
        postDate: input.date,
        estimatedAmountCents: signedAmount,
        actualAmountCents: signedAmount,
        actualDate: input.date,
        balanceDelta: postedOneOffBalanceDelta({
          direction: entryType,
          actualMagnitudeCents: magnitude,
          actualDate: input.date,
        }),
      },
    };
  }

  return {
    ok: true,
    value: {
      entryType,
      status: 'PLANNED',
      postDate: input.date,
      estimatedAmountCents: signedAmount,
      actualAmountCents: null,
      actualDate: null,
      balanceDelta: { ledgerCents: 0, availableCents: 0 },
    },
  };
}
