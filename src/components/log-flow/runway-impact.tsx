import { Info } from 'lucide-react';
import { formatCents } from '@/lib/format';
import type { RunwayImpact } from '@/lib/runway-impact';

function copy(impact: Exclude<RunwayImpact, { kind: 'unknown' }>): { title: string; body: string } {
  switch (impact.kind) {
    case 'unchanged':
      return {
        title: `Runway stays ${formatCents(impact.runwayCents)}`,
        body:
          impact.reason === 'matches-estimate'
            ? "This matches your estimated amount, so your projected balance won't change."
            : "This entry falls after your lowest balance, so your runway won't change.",
      };
    case 'lower':
      return {
        title: `Runway drops to about ${formatCents(impact.runwayCents)}`,
        body: `This is ${formatCents(impact.deltaCents)} worse than planned, so your lowest projected balance falls by the same amount.`,
      };
    case 'higher':
      return {
        title: `Runway rises to about ${formatCents(impact.runwayCents)}`,
        body: `This is ${formatCents(impact.deltaCents)} better than planned, so your lowest projected balance rises by the same amount.`,
      };
  }
}

/** "Runway impact" preview shown under the post form fields. */
export function RunwayImpactBox({ impact }: { impact: RunwayImpact }) {
  if (impact.kind === 'unknown') return null;
  const { title, body } = copy(impact);
  return (
    <section
      aria-label="Runway impact"
      aria-live="polite"
      className="flex gap-3 rounded-lg border border-info-foreground/30 bg-info p-4 text-info-foreground"
    >
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">Runway impact</p>
        <p className="mt-1 text-base font-semibold">{title}</p>
        <p className="mt-1 text-sm">{body}</p>
      </div>
    </section>
  );
}