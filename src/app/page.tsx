'use client';

import { useCallback, useEffect, useState } from 'react';
import { BalanceChart } from '@/components/balance-chart';
import { LedgerDifferenceCard } from '@/components/ledger-difference-card';
import { PageHeader } from '@/components/page-header';
import { RUNWAY_CHANGED_EVENT } from '@/components/log-flow/events';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { RunwayCallout } from '@/components/runway-callout';
import { UpcomingCard } from '@/components/upcoming-card';
import { VarianceCard } from '@/components/variance-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import { buildCycleViewModel } from '@/lib/cycle-view-model';
import { formatMonthDay } from '@/lib/format';
import { buildOverviewViewModel } from '@/lib/overview-view-model';
import { daysBetween, weekdayAbbr } from '@/lib/projection/dates';
import type { ProjectionResponse } from '@/lib/projection-response';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; projection: ProjectionResponse };

export default function OverviewPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const { openLogFlow } = useLogFlow();

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ kind: 'loading' });
    try {
      // Visitor's local calendar date. Never toISOString(): it converts to UTC.
      const today = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/projection?today=${encodeURIComponent(today)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const projection = (await res.json()) as ProjectionResponse;
      setState({ kind: 'ready', projection });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The shell's "Reset" control fires this after reseeding the workspace.
  useEffect(() => {
    const onReset = () => void load();
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => window.removeEventListener(DEMO_RESET_EVENT, onReset);
  }, [load]);

  // Log_Flow fires this after a successful post, skip, one-off or purchase. Refetch quietly
  // so the page does not flash its loading state.
  useEffect(() => {
    const onChanged = () => void load(true);
    window.addEventListener(RUNWAY_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RUNWAY_CHANGED_EVENT, onChanged);
  }, [load]);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="How low will my account get before I'm paid again?"
        actions={
          <Button type="button" size="lg" onClick={() => openLogFlow({ mode: 'post' })}>
            Log
          </Button>
        }
      />
      <Body state={state} onRetry={() => void load()} />
    </>
  );
}

function Body({ state, onRetry }: { state: State; onRetry: () => void }) {
  if (state.kind === 'loading') {
    return (
      <Card>
        <p role="status" className="px-(--card-spacing) text-muted-foreground">
          Loading projection&hellip;
        </p>
      </Card>
    );
  }
  if (state.kind === 'error') {
    return (
      <Card>
        <div className="flex flex-wrap items-center gap-4 px-(--card-spacing)">
          <p role="alert" className="text-destructive">
            Projection failed. Please try again.
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const { projection } = state;
  const balances = projection.balances ?? [];
  if (balances.length === 0) {
    return (
      <Card>
        <p className="px-(--card-spacing) text-muted-foreground">
          No accounts or entries yet. Use Reset in the sidebar to load sample data.
        </p>
      </Card>
    );
  }

  const today = balances[0].date;
  const { runway } = projection;
  const warnings = projection.warnings ?? {};
  const horizonDays = runway ? Math.max(0, daysBetween(today, runway.projectionEndDate)) : balances.length;
  const chart = buildCycleViewModel(projection, horizonDays);
  const vm = buildOverviewViewModel(projection, today);
  const below = warnings.belowThreshold;
  const thresholdCents = projection.settings?.lowBalanceThresholdCents ?? below?.thresholdCents ?? null;
  const payday = vm.nextPayday;
  const hasLedgerItems = vm.ledgerDifferenceItems.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <RunwayCallout
            className="md:col-span-2"
            runway={runway}
            isEstimated={balances[0].isEstimated}
            horizonDays={horizonDays}
            daysUntilPayday={vm.daysUntilPayday}
            belowThreshold={below ?? null}
          />
          <div className="grid grid-cols-1 gap-6">
            <StatCard
              label="Available now"
              info="What you can spend today: your ledger balance minus pending charges and deposits still on hold."
              footer={
                vm.ledgerNowCents !== null && (
                  <>
                    <Money cents={vm.ledgerNowCents} tone="muted" /> in ledger
                  </>
                )
              }
            >
              {vm.availableNowCents !== null ? <Money cents={vm.availableNowCents} tone="auto" /> : '\u2014'}
            </StatCard>
            <StatCard label="Next payday" footer={payday?.name}>
              {payday ? (
                <>
                  <time dateTime={payday.date}>
                    {weekdayAbbr(payday.date)} {formatMonthDay(payday.date)}
                  </time>
                  <span className="font-normal text-muted-foreground"> &middot; </span>
                  <Money cents={payday.amountCents} showPlus tone="income" className="font-medium" />
                </>
              ) : (
                <span className="text-base font-normal text-muted-foreground">None scheduled</span>
              )}
            </StatCard>
          </div>
        </div>

        <BalanceChart
          series={chart.series}
          boundaries={chart.boundaries}
          runway={runway}
          thresholdCents={thresholdCents}
          paydayDate={payday?.date ?? null}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {hasLedgerItems && <LedgerDifferenceCard items={vm.ledgerDifferenceItems} />}
          <VarianceCard
            variance={projection.variance ?? null}
            className={hasLedgerItems ? undefined : 'lg:col-span-2'}
          />
        </div>
      </div>

      <UpcomingCard groups={vm.upcomingGroups} summary={vm.cycleSummary} className="min-w-0 xl:col-span-4" />
    </div>
  );
}