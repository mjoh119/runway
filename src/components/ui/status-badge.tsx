import * as React from 'react';
import { Chip, type ChipVariant } from '@/components/ui/chip';

export type StatusKind = 'pending' | 'overdue' | 'on-hold' | 'moved';

const KINDS: Record<StatusKind, { label: string; variant: ChipVariant }> = {
  pending: { label: 'Pending', variant: 'pending' },
  overdue: { label: 'Overdue', variant: 'overdue' },
  'on-hold': { label: 'On hold', variant: 'neutral' },
  moved: { label: 'Moved', variant: 'neutral' },
};

export interface StatusBadgeProps extends Omit<React.ComponentProps<typeof Chip>, 'variant'> {
  status: StatusKind;
  /** Overrides the default label, e.g. "Moved from Sat Oct 24". */
  label?: string;
}

/** Pending, Overdue, On hold, Moved from...: text always carries the meaning, color only reinforces it. */
export function StatusBadge({ status, label, ...props }: StatusBadgeProps) {
  const { label: text, variant } = KINDS[status];
  return (
    <Chip variant={variant} data-status={status} {...props}>
      {label ?? text}
    </Chip>
  );
}