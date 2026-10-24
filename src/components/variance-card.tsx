import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, type ChipVariant } from '@/components/ui/chip';
import { Money } from '@/components/ui/money';
import { formatCents, formatMonthDay } from '@/lib/format';
import type { ProjectionResponse } from '@/lib/projection-response';

type Variance = NonNullable<ProjectionResponse['variance']>;

/** Negative variance = less cash than planned (unfavorable). Text carries the meaning, tone only reinforces it. */
export function varianceChip(totalCents: number): { text: string; variant: ChipVariant } {
  if (totalCents < 0) return { text: `Over by ${formatCents(Math.abs(totalCents))}`, variant: 'overdue' };
  if (totalCents > 0) return { text: `Under by ${formatCents(totalCents)}`, variant: 'success' };
  return { text: 'On plan', variant: 'neutral' };
}

function rowVariance(cents: number): { text: string; className: string } {
  if (cents < 0) return { text: `Over by ${formatCents(Math.abs(cents))}`, className: 'text-destructive' };
  if (cents > 0) return { text: `Under by ${formatCents(cents)}`, className: 'text-success' };
  return { text: 'On plan', className: 'text-muted-foreground' };
}

/** Posted entries in the current pay cycle with estimate, actual and variance. */
export function VarianceCard({ variance, className }: { variance: Variance | null; className?: string }) {
  const chip = variance ? varianceChip(variance.totalCents) : null;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="variance-heading" className="text-base font-semibold">
            Plan vs actual
          </h2>
          {chip && (
            <Chip variant={chip.variant} data-testid="cumulative-variance">
              {chip.text}
            </Chip>
          )}
        </CardTitle>
      </CardHeader>
      {!variance || variance.rows.length === 0 ? (
        <p className="px-(--card-spacing) text-sm text-muted-foreground">
          Nothing posted yet this cycle. Post an actual to see how it compares to the plan.
        </p>
      ) : (
        <ul aria-labelledby="variance-heading" className="divide-y divide-border/60">
          {variance.rows.map((r) => {
            const v = rowVariance(r.varianceCents);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-(--card-spacing) py-3"
                data-testid="variance-row"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Posted <time dateTime={r.actualDate}>{formatMonthDay(r.actualDate)}</time> · Estimate{' '}
                    <Money cents={r.estimatedCents} showPlus tone="muted" />
                  </p>
                </div>
                <div className="text-right">
                  <Money cents={r.actualCents} showPlus className="text-sm font-semibold" />
                  <p className={`mt-0.5 text-xs font-medium ${v.className}`}>
                    {v.text}
                    {r.varianceCents !== 0 && (
                      <>
                        {' '}
                        (<Money cents={r.varianceCents} showPlus tone="default" className="text-inherit" />)
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
