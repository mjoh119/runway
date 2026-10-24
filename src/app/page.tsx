'use client';

import { useCallback, useEffect, useState } from 'react';
import { BalanceChart } from '@/components/balance-chart';
import { BalanceDifference } from '@/components/balance-difference';
import { EntryTimeline } from '@/components/entry-timeline';
import { LowBalanceWarning } from '@/components/low-balance-warning';
import { ResetDemoButton } from '@/components/reset-demo-button';
import { RunwayCallout } from '@/components/runway-callout';
import { buildCycleViewModel } from '@/lib/cycle-view-model';
import type { ProjectionOutput } from '@/lib/projection/types';

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; projection: ProjectionOutput };

export default function CyclePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      // Visitor's local calendar date. Never toISOString(): it converts to UTC.
      const today = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/projection?today=${encodeURIComponent(today)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const projection = (await res.json()) as ProjectionOutput;
      setState({ kind: 'ready', projection });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Runway</h1>
        <ResetDemoButton onReset={load} />
      </header>
      <Body state={state} />
    </main>
  );
}

function Body({ state }: { state: State }) {
  if (state.kind === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Loading projection…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="text-destructive">
        Projection failed. Please try again.
      </p>
    );
  }

  const { projection } = state;
  const balances = projection.balances ?? [];
  if (balances.length === 0) {
    return (
      <p className="text-muted-foreground">
        No accounts or entries yet. Use Reset demo to load sample data.
      </p>
    );
  }

  const { runway } = projection;
  const warnings = projection.warnings ?? {};
  const horizonDays = runway
    ? Math.max(0, dayNumber(runway.projectionEndDate) - dayNumber(balances[0].date))
    : balances.length;
  const model = buildCycleViewModel(projection, horizonDays);
  const below = warnings.belowThreshold;

  return (
    <div className="space-y-6">
      <RunwayCallout runway={runway} isEstimated={balances[0]?.isEstimated} horizonDays={horizonDays} />
      {below && (
        <LowBalanceWarning
          lowestBalanceCents={below.lowestBalanceCents}
          date={below.date}
          thresholdCents={below.thresholdCents}
        />
      )}
      <BalanceChart series={model.series} boundaries={model.boundaries} runway={runway} />
      <BalanceDifference reason={warnings.availableBalanceDifference?.reason} />
      <EntryTimeline entries={projection.upcomingEntries ?? []} overdueEntries={warnings.overdueEntries} />
    </div>
  );
}
