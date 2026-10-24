export interface BalanceDelta {
  /** Always applied. */
  ledgerCents: number;
  /** Applied only when the account's available balance is not null. */
  availableCents: number;
}

export interface PostingInput {
  direction: 'INCOME' | 'DEBIT';
  /** PLANNED for scheduled occurrences and planned one-offs; PENDING for pending entries. */
  status: 'PLANNED' | 'PENDING';
  /** E, magnitude >= 0 */
  estimateMagnitudeCents: number;
  /** A, magnitude > 0 */
  actualMagnitudeCents: number;
  actualDate: string;
  holdReleaseDate?: string;
}

function incomeDelta(
  actual: number,
  actualDate: string,
  holdReleaseDate: string | undefined,
): BalanceDelta {
  const held = holdReleaseDate !== undefined && holdReleaseDate > actualDate;
  return { ledgerCents: actual, availableCents: held ? 0 : actual };
}

/**
 * Balance change when an entry is posted at an actual amount.
 * Pending income is treated like planned income (the engine ignores pending income).
 */
export function postingBalanceDelta(input: PostingInput): BalanceDelta {
  const a = Math.abs(input.actualMagnitudeCents);
  if (input.direction === 'INCOME') {
    return incomeDelta(a, input.actualDate, input.holdReleaseDate);
  }
  if (input.status === 'PENDING') {
    // The pending estimate already reduced available; only the difference remains.
    const e = Math.abs(input.estimateMagnitudeCents);
    return { ledgerCents: -a, availableCents: e - a };
  }
  return { ledgerCents: -a, availableCents: -a };
}

/** Balance change for a one-off saved directly as POSTED (already happened). */
export function postedOneOffBalanceDelta(
  input: Omit<PostingInput, 'status' | 'estimateMagnitudeCents'>,
): BalanceDelta {
  return postingBalanceDelta({
    ...input,
    status: 'PLANNED',
    estimateMagnitudeCents: input.actualMagnitudeCents,
  });
}

export type LineItemChange =
  | { kind: 'create'; amountCents: number }
  | { kind: 'edit'; oldCents: number; newCents: number }
  | { kind: 'delete'; amountCents: number };

/** Balance change for an envelope line item (always a debit on the primary account). */
export function lineItemDelta(change: LineItemChange): BalanceDelta {
  let d: number;
  switch (change.kind) {
    case 'create':
      d = -change.amountCents;
      break;
    case 'edit':
      d = change.oldCents - change.newCents;
      break;
    case 'delete':
      d = change.amountCents;
      break;
  }
  return { ledgerCents: d, availableCents: d };
}
