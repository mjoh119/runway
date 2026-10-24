'use client';

import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EnvelopeDetail, EnvelopeRow, EnvelopeTile } from '@/components/envelope-card';
import { EnvelopeForm, type EnvelopeFormTarget } from '@/components/envelope-form';
import { RUNWAY_CHANGED_EVENT } from '@/components/log-flow/events';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { PageHeader } from '@/components/page-header';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { SectionCard } from '@/components/ui/section-card';
import type { EnvelopeCardView } from '@/lib/envelopes/view-model';
import { formatCents, formatMonthDay } from '@/lib/format';
import type { ProjectionResponse } from '@/lib/projection-response';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; envelopes: EnvelopeCardView[]; cycle: { startDate: string; endDate: string } | null };

type FormState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; envelope: EnvelopeFormTarget };

export default function EnvelopesPage() {
  const { openLogFlow } = useLogFlow();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // `showLoading` is false for background refetches so the cards do not flash away mid-edit.
  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setState({ kind: 'loading' });
    try {
      // Visitor's local calendar date. Never toISOString(): it converts to UTC.
      const today = encodeURIComponent(new Date().toLocaleDateString('en-CA'));
      const [eRes, pRes] = await Promise.all([
        fetch(`/api/envelopes?today=${today}`),
        fetch(`/api/projection?today=${today}`),
      ]);
      if (!eRes.ok) throw new Error(`HTTP ${eRes.status}`);
      const body = (await eRes.json()) as { envelopes: EnvelopeCardView[] };
      // The pay-cycle label is optional: the page still works if the projection is unavailable.
      let cycle: { startDate: string; endDate: string } | null = null;
      if (pRes.ok) {
        const projection = (await pRes.json()) as ProjectionResponse;
        const first = projection.payCycles?.[0];
        if (first) cycle = { startDate: first.startDate, endDate: first.endDate };
      }
      setState({ kind: 'ready', envelopes: body.envelopes, cycle });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const onChanged = () => void load(false);
    const onReset = () => {
      setForm({ kind: 'closed' });
      setSelectedId(null);
      void load(true);
    };
    window.addEventListener(RUNWAY_CHANGED_EVENT, onChanged);
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(RUNWAY_CHANGED_EVENT, onChanged);
      window.removeEventListener(DEMO_RESET_EVENT, onReset);
    };
  }, [load]);

  const newButton = (
    <Button type="button" size="lg" onClick={() => setForm({ kind: 'create' })} disabled={form.kind !== 'closed'}>
      New envelope
    </Button>
  );

  const envelopes = state.kind === 'ready' ? state.envelopes : [];
  const selected = envelopes.find((e) => e.id === selectedId) ?? envelopes[0];
  const others = envelopes.filter((e) => e.id !== selected?.id);
  const totalBudget = envelopes.reduce((s, e) => s + e.budgetCents, 0);
  const totalSpent = envelopes.reduce((s, e) => s + e.spentCents, 0);
  const totalLeft = envelopes.reduce((s, e) => s + e.leftCents, 0);

  const formNode =
    form.kind === 'closed' ? null : (
      <EnvelopeForm
        key={form.kind === 'edit' ? form.envelope.id : 'new'}
        envelope={form.kind === 'edit' ? form.envelope : undefined}
        onDone={() => setForm({ kind: 'closed' })}
        onCancel={() => setForm({ kind: 'closed' })}
      />
    );

  return (
    <>
      <PageHeader
        title="Envelopes"
        subtitle="Set aside money for what you spend on, this pay cycle."
        actions={newButton}
      />
      <div className="flex flex-col gap-6">
        {state.kind === 'loading' && (
          <Card>
            <p role="status" className="px-(--card-spacing) text-muted-foreground">
              Loading envelopes&hellip;
            </p>
          </Card>
        )}
        {state.kind === 'error' && (
          <Card>
            <div className="flex flex-wrap items-center gap-4 px-(--card-spacing)">
              <p role="alert" className="text-destructive">
                Envelopes failed to load. Please try again.
              </p>
              <Button type="button" variant="outline" onClick={() => void load(true)}>
                Retry
              </Button>
            </div>
          </Card>
        )}
        {state.kind === 'ready' && (
          <>
            {envelopes.length > 0 && (
              <Card>
                <section
                  aria-label="Envelope totals"
                  className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-(--card-spacing)"
                >
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">
                      This pay cycle
                      {state.cycle && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          &middot; {formatMonthDay(state.cycle.startDate)} &ndash; {formatMonthDay(state.cycle.endDate)}
                        </span>
                      )}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Unspent envelope money already counted against your runway: {formatCents(totalLeft)}.
                    </p>
                  </div>
                  <dl className="flex gap-8">
                    <div>
                      <dt className="text-xs text-muted-foreground">Total budget</dt>
                      <dd className="mt-0.5 text-xl font-semibold">
                        <Money cents={totalBudget} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total spent</dt>
                      <dd className="mt-0.5 text-xl font-semibold">
                        <Money cents={totalSpent} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Unspent</dt>
                      <dd className="mt-0.5 text-xl font-semibold">
                        <Money cents={totalLeft} />
                      </dd>
                    </div>
                  </dl>
                </section>
              </Card>
            )}

            {formNode}

            {envelopes.length === 0 && form.kind === 'closed' && (
              <Card>
                <div className="flex flex-col items-center gap-3 px-(--card-spacing) py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Wallet className="size-6" aria-hidden="true" />
                  </span>
                  <h2 className="text-base font-semibold">No envelopes yet</h2>
                  <p className="max-w-sm text-muted-foreground">
                    Create your first envelope to start setting aside money for flexible spending.
                  </p>
                  <Button type="button" size="lg" onClick={() => setForm({ kind: 'create' })}>
                    Create envelope
                  </Button>
                </div>
              </Card>
            )}

            {envelopes.length > 0 && (
              <section aria-label="Envelopes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {envelopes.map((view) => (
                  <EnvelopeTile
                    key={view.id}
                    view={view}
                    selected={view.id === selected?.id}
                    onSelect={() => setSelectedId(view.id)}
                  />
                ))}
              </section>
            )}

            {selected && (
              <EnvelopeDetail
                view={selected}
                onEdit={() =>
                  setForm({
                    kind: 'edit',
                    envelope: {
                      id: selected.id,
                      name: selected.name,
                      budgetCents: selected.budgetCents,
                      resetPeriod: selected.resetPeriod,
                    },
                  })
                }
                onAddPurchase={() => openLogFlow({ mode: 'purchase' })}
              />
            )}

            {others.length > 0 && (
              <SectionCard id="other-envelopes" title="Other envelopes" flush>
                <div className="divide-y divide-border border-t border-border">
                  {others.map((view) => (
                    <EnvelopeRow key={view.id} view={view} onSelect={() => setSelectedId(view.id)} />
                  ))}
                </div>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </>
  );
}