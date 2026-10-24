import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps extends Omit<React.ComponentProps<'section'>, 'title'> {
  title: React.ReactNode;
  /** Optional muted line under the title. */
  description?: React.ReactNode;
  /** Optional control on the right of the header row (link, button, chip). */
  action?: React.ReactNode;
  /** Optional leading icon in the header. */
  icon?: React.ReactNode;
  /** Remove body padding so lists and tables can run edge to edge. */
  flush?: boolean;
  bodyClassName?: string;
}

/** Bordered panel: header row (title + optional action), then body. */
export function SectionCard({
  title,
  description,
  action,
  icon,
  flush = false,
  className,
  bodyClassName,
  children,
  id,
  ...props
}: SectionCardProps) {
  const headingId = id ? `${id}-heading` : React.useId();
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <section id={id} aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col" {...props}>
        <header className="flex items-start justify-between gap-4 px-(--card-spacing) py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-5">{icon}</span>}
            <div className="min-w-0">
              <h2 id={headingId} className="text-base leading-6 font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
        <div className={cn('flex-1', flush ? '' : 'px-(--card-spacing) pb-(--card-spacing)', bodyClassName)}>
          {children}
        </div>
      </section>
    </Card>
  );
}