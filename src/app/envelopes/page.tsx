'use client';

import { useCallback, useEffect, useState } from 'react';
import { EnvelopeCard } from '@/components/envelope-card';
import { EnvelopeForm, type EnvelopeFormTarget } from '@/components/envelope-form';
import { RUNWAY_CHANGED_EVENT } from '@/components/log-flow/events';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { MobileTitle, PageHeader } from '@/components/page-header';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { Button } from '@/components/ui/button';
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
      <EnvelopeForm
        key={form.kind === 'edit' ? form.envelope.id : 'new'}
        envelope={form.kind === 'edit' ? form.envelope : undefined}
        onDone={() => setForm({ kind: 'closed' })}
        onCancel={() => setForm({ kind: 'closed' })}
      />
    );

  return (
    <>
      <PageHeader title="Envelopes" subtitle="Flexible spending budgets, and how they move your runway." />
      <MobileTitle title="Envelopes" />
      <div className="flex max-w-3xl flex-col gap-5">
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
            {state.envelopes.length === 0 && form.kind === 'closed' ? (
              <Card>
                <div className="flex flex-col items-start gap-3 px-(--card-spacing)">
                  <p className="text-muted-foreground">
                    No envelopes yet. Create one to set aside money for flexible spending.
                  </p>
                  <Button type="button" onClick={() => setForm({ kind: 'create' })}>
                    Create envelope
                  </Button>
                </div>
              </Card>
            ) : (
              form.kind === 'closed' && (
                <div>
                  <Button type="button" variant="outline" onClick={() => setForm({ kind: 'create' })}>
                    New envelope
                  </Button>
                </div>
              )
            )}
            {formNode}
            {state.envelopes.map((view) => (
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
          </>
        )}
      </div>
    </>
  );
}
