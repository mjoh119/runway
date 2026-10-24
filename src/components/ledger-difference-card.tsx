import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents } from '@/lib/format';
import type { LedgerDifferenceItem } from '@/lib/overview-view-model';

/** "Why available isn't the same as ledger". Renders nothing when there are no items. */
export function LedgerDifferenceCard({ items, className }: { items: LedgerDifferenceItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Why available isn&apos;t the same as ledger</h2>
        </CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border/60 px-(--card-spacing)">
        {items.map((it, i) => {
          // text starts with the formatted amount; bold it, keep the rest muted-free prose.
          const amount = formatCents(it.amountCents);
          const rest = it.text.startsWith(amount) ? it.text.slice(amount.length) : ` ${it.text}`;
          return (
            <li key={`${it.kind}-${it.description}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <strong className="money font-semibold">{amount}</strong>
                {rest}
              </span>
              <span className="shrink-0 text-muted-foreground">{it.kind}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
