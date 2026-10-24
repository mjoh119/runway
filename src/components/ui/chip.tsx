import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'neutral' | 'pending' | 'overdue' | 'warning' | 'info' | 'success';

// Token classes only. `warning` is the single warning color; `overdue` is red.
const VARIANTS: Record<ChipVariant, string> = {
  neutral: 'bg-muted text-muted-foreground',
  pending: 'bg-secondary text-secondary-foreground',
  overdue: 'bg-destructive-soft text-destructive',
  warning: 'border border-warning-border bg-warning text-warning-foreground',
  info: 'bg-info text-info-foreground',
  success: 'bg-success/10 text-success',
};

export interface ChipProps extends React.ComponentProps<'span'> {
  variant?: ChipVariant;
}

/** Small rounded status label. */
export function Chip({ variant = 'neutral', className, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
