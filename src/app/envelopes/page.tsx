'use client';

import { useCallback, useEffect, useState } from 'react';
import { EnvelopeCard } from '@/components/envelope-card';
import { EnvelopeForm, type EnvelopeFormTarget } from '@/components/envelope-form';
import { RUNWAY_CHANGED_EVENT } from '@/components/log-flow/events';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { MobileTitle, PageHeader } from '@/components/page-header';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import type { EnvelopeCardView } from '@/lib/envelopes/view-model';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; envelopes: EnvelopeCardView[] };

type FormState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; envelope: EnvelopeFormTarget };

export default function EnvelopesPage() {
  const { openLogFlow } = useLogFlow();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [form, setForm] = useState<FormState>({ kind: 'closed' });

  // `showLoading` is false for background refetches so the cards do not flash away mid-edit.
  const load = useCallback(async (showLoading: boolean) => {
    if (showLoading) setState({ kind: 'loading' });
    try {
      // Visitor's local calendar date. Never toISOString(): it converts to UTC.
      const today = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/envelopes?today=${encodeURIComponent(today)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { envelopes: EnvelopeCardView[] };
      setState({ kind: 'ready', envelopes: body.envelopes });
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
      void load(true);
    };
    window.addEventListener(RUNWAY_CHANGED_EVENT, onChanged);
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(RUNWAY_CHANGED_EVENT, onChanged);
      window.removeEventListener(DEMO_RESET_EVENT, onReset);
    };
  }, [load]);

  const formNode =
    form.kind === 'closed' ? null : (
      <div className="md:col-span-2 xl:col-span-3">
        <EnvelopeForm
          key={form.kind === 'edit' ? form.envelope.id : 'new'}
          envelope={form.kind === 'edit' ? form.envelope : undefined}
          onDone={() => setForm({ kind: 'closed' })}
          onCancel={() => setForm({ kind: 'closed' })}
        />
      </div>
    );

  const newButton = (
    <Button type="button" size="lg" onClick={() => setForm({ kind: 'create' })} disabled={form.kind !== 'closed'}>
      New envelope
    </Button>
  );

  const envelopes = state.kind === 'ready' ? state.envelopes : [];
  const totalBudget = envelopes.reduce((s, e) => s + e.budgetCents, 0);
  const totalSpent = envelopes.reduce((s, e) => s + e.spentCents, 0);
  const totalLeft = envelopes.reduce((s, e) => s + e.leftCents, 0);
  const totalOver = envelopes.reduce((s, e) => s + e.overageCents, 0);
  const overCount = envelopes.filter((e) => e.overageCents > 0).length;

  return (
    <>
      <PageHeader
        title="Envelopes"
        subtitle="Flexible spending budgets, and how they move your runway."
        actions={newButton}
      />
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <MobileTitle title="Envelopes" className="mb-0" />
        {newButton}
      </div>
      <div className="flex flex-col gap-6">
        {state.kind === 'loading' && (
          <Card>
            <p role="status" className="px-(--card-spacing) text-muted-foreground">
              Loading envelopes…
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
              <section aria-label="Envelope totals" className="grid grid-cols-2 gap-6 xl:grid-cols-4">
                <StatCard label="Total budget" footer={`${envelopes.length} ${envelopes.length === 1 ? 'envelope' : 'envelopes'}`}>
                  <Money cents={totalBudget} />
                </StatCard>
                <StatCard label="Spent this period" footer={totalBudget > 0 ? `${Math.floor((totalSpent * 100) / totalBudget)}% of budget` : undefined}>
                  <Money cents={totalSpent} />
                </StatCard>
                <StatCard label="Left to spend" footer="Held back from your runway">
                  <Money cents={totalLeft} />
                </StatCard>
                <StatCard
                  label="Over budget"
                  footer={overCount > 0 ? `${overCount} ${overCount === 1 ? 'envelope' : 'envelopes'} over` : 'All within budget'}
                >
                  <span className={totalOver > 0 ? 'text-destructive' : undefined}>
                    <Money cents={totalOver} tone="default" />
                  </span>
                </StatCard>
              </section>
            )}

            {envelopes.length === 0 && form.kind === 'closed' ? (
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
            ) : (
              <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
                {formNode}
                {envelopes.map((view) => (
                  <EnvelopeCard
                    key={view.id}
                    view={view}
                    onEdit={() =>
                      setForm({
                        kind: 'edit',
                        envelope: {
                          id: view.id,
                          name: view.name,
                          budgetCents: view.budgetCents,
                          resetPeriod: view.resetPeriod,
                        },
                      })
                    }
                    onAddPurchase={() => openLogFlow({ mode: 'purchase' })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}