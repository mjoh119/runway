/**
 * Pure helpers for the Log_Flow one-off form. No React imports so they stay
 * unit-testable. Dates are ISO calendar strings (YYYY-MM-DD), which compare
 * correctly as plain strings.
 */

export interface AlreadyHappenedState {
  /** Current value of the "This already happened" checkbox. */
  alreadyHappened: boolean;
  /** True once the user has toggled the checkbox themselves. */
  manuallyToggled: boolean;
}

/** The checkbox defaults to checked when the date is today or in the past. */
export function alreadyHappenedDefault(date: string, today: string): boolean {
  return date <= today;
}

/**
 * Next checkbox value after the date changes. Follows the date default unless
 * the user has toggled the checkbox manually, in which case their choice is kept.
 */
export function nextAlreadyHappened(
  state: AlreadyHappenedState,
  newDate: string,
  today: string,
): boolean {
  if (state.manuallyToggled) return state.alreadyHappened;
  return alreadyHappenedDefault(newDate, today);
}

export interface PostPrefill {
  amount: string;
  actualDate: string;
}

/** Post form values for a chosen entry: its estimate (plain decimal) and today. */
export function postPrefill(
  estimatedAmountCents: number,
  today: string,
  formatPlain: (cents: number) => string,
): PostPrefill {
  return { amount: formatPlain(Math.abs(estimatedAmountCents)), actualDate: today };
}

/** Purchase form opens with today's date and an empty amount. */
export function purchasePrefill(today: string): { amount: string; purchaseDate: string } {
  return { amount: '', purchaseDate: today };
}

/**
 * One Submission_Key per opened form. `key` is generated when the session is
 * created (form open) and returned unchanged on every attempt.
 */
export function createSubmissionSession(generate: () => string): { readonly key: string } {
  const key = generate();
  return { key };
}
