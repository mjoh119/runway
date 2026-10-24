export interface BalanceDifferenceProps {
  /** One-line reason from the engine, e.g. "$500 deposit on hold until Oct 27". */
  reason?: string | null;
}

/** One-line explanation of why available and ledger balances differ (Requirement 13.4). */
export function BalanceDifference({ reason }: BalanceDifferenceProps) {
  if (!reason) return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="balance-difference">
      <span className="font-medium">Why available differs from ledger:</span> {reason}
    </p>
  );
}
