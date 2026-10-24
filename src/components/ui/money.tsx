import * as React from 'react';
import { formatSignedCents } from '@/lib/format';
import { cn } from '@/lib/utils';

export type MoneyTone = 'default' | 'muted' | 'income' | 'auto';

const TONES: Record<Exclude<MoneyTone, 'auto'>, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  income: 'text-success',
};

export interface MoneyProps extends React.ComponentProps<'span'> {
  /** Integer cents. */
  cents: number;
  /** Prefix positive amounts with "+". Negatives always get a real minus sign. */
  showPlus?: boolean;
  /**
   * default: primary text; muted; income: muted green;
   * auto: red when negative, primary text otherwise (balances only).
   */
  tone?: MoneyTone;
}

/** Money display: integer cents, tabular numerals, token colors. */
export function Money({ cents, showPlus = false, tone = 'default', className, ...props }: MoneyProps) {
  const toneClass = tone === 'auto' ? (cents < 0 ? 'text-destructive' : TONES.default) : TONES[tone];
  return (
    <span data-slot="money" className={cn('money', toneClass, className)} {...props}>
      {formatSignedCents(cents, showPlus)}
    </span>
  );
}
