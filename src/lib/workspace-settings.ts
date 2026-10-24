/**
 * Workspace settings validation. Pure; no I/O.
 * Money is integer cents.
 */

export const MIN_LOW_BALANCE_THRESHOLD_CENTS = 0;
export const MAX_LOW_BALANCE_THRESHOLD_CENTS = 999_999_999;
export const MIN_PROJECTION_HORIZON_DAYS = 1;
export const MAX_PROJECTION_HORIZON_DAYS = 365;

export interface WorkspaceSettings {
  /** null means no threshold is set */
  lowBalanceThresholdCents: number | null;
  projectionHorizonDays: number;
}

function assertIntegerInRange(
  name: string,
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RangeError(
      `${name} must be an integer between ${min} and ${max}, received ${String(value)}`,
    );
  }
  if (value < min || value > max) {
    throw new RangeError(
      `${name} must be between ${min} and ${max}, received ${value}`,
    );
  }
  return value;
}

/** Validates the low-balance threshold in integer cents (0 to 999,999,999). */
export function validateLowBalanceThresholdCents(value: unknown): number {
  return assertIntegerInRange(
    'lowBalanceThresholdCents',
    value,
    MIN_LOW_BALANCE_THRESHOLD_CENTS,
    MAX_LOW_BALANCE_THRESHOLD_CENTS,
  );
}

/** Validates the projection horizon in days (1 to 365). */
export function validateProjectionHorizonDays(value: unknown): number {
  return assertIntegerInRange(
    'projectionHorizonDays',
    value,
    MIN_PROJECTION_HORIZON_DAYS,
    MAX_PROJECTION_HORIZON_DAYS,
  );
}

/**
 * Validates a full settings object. A null or undefined threshold means
 * "no threshold set" and is allowed; anything else must be in range.
 */
export function validateWorkspaceSettings(input: {
  lowBalanceThresholdCents?: unknown;
  projectionHorizonDays: unknown;
}): WorkspaceSettings {
  const threshold = input.lowBalanceThresholdCents;
  return {
    lowBalanceThresholdCents:
      threshold === null || threshold === undefined
        ? null
        : validateLowBalanceThresholdCents(threshold),
    projectionHorizonDays: validateProjectionHorizonDays(
      input.projectionHorizonDays,
    ),
  };
}
