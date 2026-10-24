import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCents, formatMonthDay } from '@/lib/format';

export interface LowBalanceWarningProps {
  /** Projected lowest available balance in integer cents. */
  lowestBalanceCents: number;
  /** 'YYYY-MM-DD' date the lowest balance occurs. */
  date: string;
  /** User threshold in integer cents, if one triggered the warning. */
  thresholdCents?: number;
}

/**
 * Shown when runway is below the user's threshold or negative (Requirements 10.1, 10.2).
 * The caller decides when to render it. Uses an explicit "Warning:" text prefix so
 * meaning is not carried by color alone.
 */
export function LowBalanceWarning({ lowestBalanceCents, date, thresholdCents }: LowBalanceWarningProps) {
  const negative = lowestBalanceCents < 0;
  return (
    <Alert variant="destructive" className="border-destructive">
      <AlertTitle>{negative ? 'Warning: balance projected to go negative' : 'Warning: low balance ahead'}</AlertTitle>
      <AlertDescription>
        Your available balance is projected to drop to{' '}
        <strong className="font-semibold">{formatCents(lowestBalanceCents)}</strong> on{' '}
        <time dateTime={date}>{formatMonthDay(date)}</time>
        {thresholdCents !== undefined && !negative
          ? `, below your ${formatCents(thresholdCents)} threshold`
          : ''}
        .
      </AlertDescription>
    </Alert>
  );
}
