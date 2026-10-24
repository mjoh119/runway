import { isValidDate } from '../projection/dates';
import { postingBalanceDelta, type BalanceDelta } from './balance-delta';
import { ServiceError, type Result } from './errors';

export interface PostableEntry {
  entryType: 'INCOME' | 'DEBIT';
  status: 'PLANNED' | 'PENDING' | 'POSTED' | 'SKIPPED';
  /** Signed or magnitude; only the magnitude is used. */
  estimatedAmountCents: number;
  holdReleaseDate?: string;
}

export interface PostPlan {
  status: 'POSTED';
  /** Signed by direction. */
  actualAmountCents: number;
  /** Unchanged, signed by direction. */
  estimatedAmountCents: number;
  actualDate: string;
  balanceDelta: BalanceDelta;
}

export interface SkipPlan {
  status: 'SKIPPED';
  balanceDelta: { ledgerCents: 0; availableCents: 0 };
}

function fail<T>(message: string, field?: string): Result<T> {
  return { ok: false, error: new ServiceError('VALIDATION', message, field) };
}

function signed(entryType: 'INCOME' | 'DEBIT', magnitude: number): number {
  const m = Math.abs(magnitude);
  return entryType === 'INCOME' ? m : -m;
}

/** Pure plan for posting an actual against an entry. Error order: date, future date, status. */
export function planPost(
  entry: PostableEntry,
  input: { amountCents: number; actualDate: string; today: string },
): Result<PostPlan> {
  if (!isValidDate(input.actualDate)) {
    return fail('Enter a valid date', 'actualDate');
  }
  if (input.actualDate > input.today) {
    return fail('An actual cannot be dated in the future', 'actualDate');
  }
  if (entry.status === 'POSTED' || entry.status === 'SKIPPED') {
    return fail('This entry cannot be posted from its current status');
  }

  const balanceDelta = postingBalanceDelta({
    direction: entry.entryType,
    status: entry.status,
    estimateMagnitudeCents: Math.abs(entry.estimatedAmountCents),
    actualMagnitudeCents: Math.abs(input.amountCents),
    actualDate: input.actualDate,
    holdReleaseDate: entry.holdReleaseDate,
  });

  return {
    ok: true,
    value: {
      status: 'POSTED',
      actualAmountCents: signed(entry.entryType, input.amountCents),
      estimatedAmountCents: signed(entry.entryType, entry.estimatedAmountCents),
      actualDate: input.actualDate,
      balanceDelta,
    },
  };
}

/** Pure plan for skipping an entry. Skipping never moves balances. */
export function planSkip(entry: Pick<PostableEntry, 'status'>): Result<SkipPlan> {
  if (entry.status === 'POSTED' || entry.status === 'SKIPPED') {
    return fail('This entry cannot be skipped from its current status');
  }
  return {
    ok: true,
    value: { status: 'SKIPPED', balanceDelta: { ledgerCents: 0, availableCents: 0 } },
  };
}
