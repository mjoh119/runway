/**
 * Input validation for envelopes, line items and settings. Pure.
 */

import { parseMoney } from '../money';
import { isValidDate } from '../projection/dates';
import type { ResetPeriod } from '../envelopes/types';
import { ServiceError, type Result } from './errors';

const RESET_PERIODS: readonly ResetPeriod[] = ['EACH_PAY_CYCLE', 'WEEKLY', 'MONTHLY'];
const MAX_NAME_LENGTH = 60;

function fail<T>(message: string, field: string): Result<T> {
  return { ok: false, error: new ServiceError('VALIDATION', message, field) };
}

export function validateEnvelopeInput(
  input: { name: string; budgetText: string; resetPeriod: string },
  otherNames: readonly string[],
): Result<{ name: string; nameKey: string; budgetCents: number; resetPeriod: ResetPeriod }> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return fail('Name must be 1 to 60 characters', 'name');
  }
  const nameKey = name.toLowerCase();
  if (otherNames.some((other) => other.trim().toLowerCase() === nameKey)) {
    return fail('That name is already in use', 'name');
  }
  const budget = parseMoney(input.budgetText);
  if (!budget.ok) return fail(budget.error, 'budget');
  if (!RESET_PERIODS.includes(input.resetPeriod as ResetPeriod)) {
    return fail('Reset period must be each pay cycle, weekly, or monthly', 'resetPeriod');
  }
  return {
    ok: true,
    value: {
      name,
      nameKey,
      budgetCents: budget.cents,
      resetPeriod: input.resetPeriod as ResetPeriod,
    },
  };
}

export function validateLineItemInput(
  input: { amountText: string; purchaseDate: string; description?: string },
  today: string,
): Result<{ amountCents: number; purchaseDate: string; description: string | null }> {
  const amount = parseMoney(input.amountText);
  if (!amount.ok) return fail(amount.error, 'amount');
  if (!isValidDate(input.purchaseDate)) {
    return fail('Enter a valid date', 'purchaseDate');
  }
  if (input.purchaseDate > today) {
    return fail('A purchase cannot be dated in the future', 'purchaseDate');
  }
  const description = input.description?.trim() ?? '';
  return {
    ok: true,
    value: {
      amountCents: amount.cents,
      purchaseDate: input.purchaseDate,
      description: description === '' ? null : description,
    },
  };
}

export function validateSettings(
  input: { thresholdText: string; horizonText: string },
): Result<{ lowBalanceThresholdCents: number | null; projectionHorizonDays: number }> {
  let lowBalanceThresholdCents: number | null = null;
  if (input.thresholdText.trim() !== '') {
    const threshold = parseMoney(input.thresholdText, { allowZero: true });
    if (!threshold.ok) return fail(threshold.error, 'threshold');
    lowBalanceThresholdCents = threshold.cents;
  }
  const horizonText = input.horizonText.trim();
  const horizon = /^\d+$/.test(horizonText) ? Number(horizonText) : NaN;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 365) {
    return fail('Projection horizon must be a whole number from 1 to 365', 'horizon');
  }
  return {
    ok: true,
    value: { lowBalanceThresholdCents, projectionHorizonDays: horizon },
  };
}
