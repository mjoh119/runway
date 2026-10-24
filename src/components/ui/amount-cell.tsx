import * as React from 'react';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/utils';

export type AmountTone = 'debit' | 'income' | 'negative' | 'muted';

export interface AmountCellProps extends React.ComponentProps<'span'> {
  /** Signed integer cents. */
  cents: number;
  /**
   * debit: plain text with a minus sign (default for negatives).
   * income: success color with a plus sign (default for positives).
   * negative: danger color, for shortfalls and overspending.
   * muted: de-emphasised.
   */
  tone?: AmountTone;
}

/** Right-aligned money cell with tabular numerals. */
export function AmountCell({ cents, tone, className, ...props }: AmountCellProps) {
  const resolved: AmountTone = tone ?? (cents > 0 ? 'income' : 'debit');
  return (
    <Money
      cents={cents}
      showPlus={resolved === 'income'}
      tone={resolved === 'income' ? 'income' : resolved === 'muted' ? 'muted' : 'default'}
      className={cn('text-right text-sm font-semibold whitespace-nowrap', resolved === 'negative' && 'text-destructive', className)}
      {...props}
    />
  );
}