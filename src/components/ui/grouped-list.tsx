import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ListGroup<T> {
  key: string;
  /** Date-group header text, e.g. "Overdue" or "Mon, Oct 26". */
  label: string;
  items: T[];
}

export interface GroupedListProps<T> {
  groups: ListGroup<T>[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/** Rows under date-group headers, edge to edge inside a flush SectionCard. */
export function GroupedList<T>({ groups, itemKey, renderItem, className, ...aria }: GroupedListProps<T>) {
  return (
    <div role="list" className={cn('flex flex-col', className)} {...aria}>
      {groups.map((g) => (
        <div key={g.key} role="listitem">
          <h3 className="border-y border-border bg-muted px-(--card-spacing) py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:border-t-0">
            {g.label}
          </h3>
          <ul className="divide-y divide-border">
            {g.items.map((item) => (
              <li key={itemKey(item)}>{renderItem(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}