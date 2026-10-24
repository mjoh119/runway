import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCents } from '@/lib/format';
import type { LedgerDifferenceItem } from '@/lib/overview-view-model';

/** "Why available isn't the same as ledger". Renders nothing when there are no items. */
export function LedgerDifferenceCard({ items, className }: { items: LedgerDifferenceItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <SectionCard id="ledger-difference" title="Why available isn't the same as ledger" className={className} flush>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((it, i) => {
          // text starts with the formatted amount; bold it and keep the rest as prose.
          const amount = formatCents(it.amountCents);
          const rest = it.text.startsWith(amount) ? it.text.slice(amount.length) : ` ${it.text}`;
          return (
            <li
              key={`${it.kind}-${it.description}-${i}`}
              className="flex items-center justify-between gap-3 px-(--card-spacing) py-3 text-sm"
            >
              <span>
                <strong className="money font-semibold">{amount}</strong>
                {rest}
              </span>
              <StatusBadge status={it.kind === 'Pending' ? 'pending' : 'on-hold'} />
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}