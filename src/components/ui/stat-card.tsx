import * as React from 'react';
import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  label: string;
  /** Optional help text shown from an info icon (native tooltip + screen-reader label). */
  info?: string;
  /** The main value. */
  children: React.ReactNode;
  /** Small muted line under the value. */
  footer?: React.ReactNode;
}

/** Compact card: label, value, muted footer. */
export function StatCard({ label, info, children, footer, className, ...props }: StatCardProps) {
  return (
    <Card className={cn('justify-center gap-1', className)} {...props}>
      <div className="px-(--card-spacing)">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {label}
          {info && (
            <span title={info} role="img" aria-label={info} tabIndex={0} className="inline-flex cursor-help rounded-full">
              <Info className="size-3.5" aria-hidden="true" />
            </span>
          )}
        </p>
        <div className="mt-1 text-2xl font-semibold">{children}</div>
        {footer && <div className="mt-0.5 text-sm text-muted-foreground">{footer}</div>}
      </div>
    </Card>
  );
}
