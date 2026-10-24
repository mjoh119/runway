'use client';

import { ClipboardList, Plus, ReceiptText, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RUNWAY_CHANGED_EVENT } from '@/components/log-flow/events';
import { useLogFlow } from '@/components/log-flow/log-flow-context';
import { MobileTitle, PageHeader } from '@/components/page-header';
import { DEMO_RESET_EVENT } from '@/components/reset-demo-button';
import { varianceChip } from '@/components/variance-card';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import type { EnvelopeCardView } from '@/lib/envelopes/view-model';
import { formatCents, formatMonthDay } from '@/lib/format';
import { buildOverviewViewModel, type UpcomingRow } from '@/lib/overview-view-model';
import { weekdayAbbr } from '@/lib/projection/dates';
import type { ProjectionResponse } from '@/lib/projection-response';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; projection: ProjectionResponse; envelopes: EnvelopeCardView[]; today: string };

interface FeedItem {
  key: string;
  date: string;
  title: string;
  detail: string;
  kind: 'entry' | 'purchase';
  /** Signed cents: money in is positive, money out negative. */
  amountCents: number;
  varianceCents: number | null;
}

function dayLabel(date: string, today: string): string {
  const base = `${weekdayAbbr(date)}, ${formatMonthDay(date)}`;
  return date === today ? `Today · ${base}` : base;
}

function buildFeed(projection: ProjectionResponse, envelopes: EnvelopeCardView[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const r of projection.variance?.rows ?? []) {
    items.push({
      key: `entry-${r.id}`,
      date: r.actualDate,
      title: r.description,
      detail: `Estimate ${formatCents(Math.abs(r.estimatedCents))}`,
      kind: 'entry',
      amountCents: r.actualCents,
      varianceCents: r.varianceCents,
    });
  }
  for (const env of envelopes) {
    const purchases = [...env.currentItems, ...(env.preceding?.items ?? [])];
    for (const p of purchases) {
      items.push({
        key: `purchase-${p.id}`,
        date: p.purchaseDate,
        title: p.description ?? 'Purchase',
        detail: env.name,
        kind: 'purchase',
        amountCents: -p.amountCents,
        varianceCents: null,
      });
    }
  }
  return items.sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date < b.date ? 1 : -1));
}

function Placeholder({ text, role = 'status' }: { text: string; role?: 'status' | 'alert' }) {
  return (
    <Card>
      <p role={role} className="px-(--card-spacing) text-muted-foreground">
        {text}
      </p>
    </Card>
  );
}

export default function LogPage() {
  const { openLogFlow } = useLogFlow();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ kind: 'loading' });
    try {
      // Visitor's local calendar date. Never toISOString(): it converts to UTC.
      const today = new Date().toLocaleDateString('en-CA');
      const q = encodeURIComponent(today);
      const [pRes, eRes] = await Promise.all([fetch(`/api/projection?today=${q}`), fetch(`/api/envelopes?today=${q}`)]);
      if (!pRes.ok || !eRes.ok) throw new Error('HTTP error');
      const projection = (await pRes.json()) as ProjectionResponse;
      const { envelopes } = (await eRes.json()) as { envelopes: EnvelopeCardView[] };
      setState({ kind: 'ready', projection, envelopes, today });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => void load(true);
    const onReset = () => void load();
    window.addEventListener(RUNWAY_CHANGED_EVENT, onChanged);
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(RUNWAY_CHANGED_EVENT, onChanged);
      window.removeEventListener(DEMO_RESET_EVENT, onReset);
    };
  }, [load]);

  const logButton = (
    <Button type="button" size="lg" onClick={() => openLogFlow({ mode: 'post' })}>
      <Plus aria-hidden="true" /> Log activity
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Log"
        subtitle="Record what actually happened and see how it compares to the plan."
        actions={logButton}
      />
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <MobileTitle title="Log" className="mb-0" />
        {logButton}
      </div>
      {state.kind === 'loading' && <Placeholder text="Loading activity…" />}
      {state.kind === 'error' && (
        <Card>
          <div className="flex flex-wrap items-center gap-4 px-(--card-spacing)">
            <p role="alert" className="text-destructive">
              Activity failed to load. Please try again.
            </p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Card>
      )}
      {state.kind === 'ready' && <Body state={state} onLog={openLogFlow} />}
    </>
  );
}

function Body({
  state,
  onLog,
}: {
  state: Extract<State, { kind: 'ready' }>;
  onLog: ReturnType<typeof useLogFlow>['openLogFlow'];
}) {
  const { projection, envelopes, today } = state;
  const feed = useMemo(() => buildFeed(projection, envelopes), [projection, envelopes]);
  const groups = useMemo(() => {
    const map = new Map<string, FeedItem[]>();
    for (const item of feed) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return [...map.entries()];
  }, [feed]);

  const pending: UpcomingRow[] = useMemo(() => {
    const rows = buildOverviewViewModel(projection, today).upcomingGroups.flatMap((g) => g.rows);
    return [...rows.filter((r) => r.status === 'overdue'), ...rows.filter((r) => r.status !== 'overdue')].slice(0, 8);
  }, [projection, today]);

  const variance = projection.variance ?? null;
  const chip = variance ? varianceChip(variance.totalCents) : null;
  const entryCount = variance?.rows.length ?? 0;
  const purchaseTotal = envelopes.reduce((s, e) => s + e.spentCents, 0);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-12">
      <StatCard className="xl:col-span-4" label="Posted this cycle" footer="Bills and paychecks marked as paid">
        {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
      </StatCard>
      <StatCard className="xl:col-span-4" label="Envelope spending" footer="Purchases in the current periods">
        <Money cents={purchaseTotal} />
      </StatCard>
      <StatCard className="md:col-span-2 xl:col-span-4" label="Plan vs actual" footer="Cumulative variance this cycle">
        {chip ? <Chip variant={chip.variant} className="px-3 py-1 text-base">{chip.text}</Chip> : '—'}
      </StatCard>

      <Card className="md:col-span-2 xl:col-span-8">
        <CardHeader>
          <CardTitle>
            <h2 className="text-base font-semibold">Recent activity</h2>
          </CardTitle>
          <CardDescription>Everything you have logged, newest first.</CardDescription>
        </CardHeader>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-(--card-spacing) py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ClipboardList className="size-6" aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold">Nothing logged yet</h3>
            <p className="max-w-sm text-muted-foreground">
              Post an actual amount against a planned bill, or add a purchase to an envelope.
            </p>
            <Button type="button" size="lg" onClick={() => onLog({ mode: 'post' })}>
              Log activity
            </Button>
          </div>
        ) : (
          <div role="list" aria-label="Recent activity">
            {groups.map(([date, items]) => (
              <div key={date} role="listitem">
                <h3 className="bg-muted px-(--card-spacing) py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {dayLabel(date, today)}
                </h3>
                <ul className="divide-y divide-border/60">
                  {items.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center justify-between gap-4 px-(--card-spacing) py-3"
                      data-testid="activity-row"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {item.kind === 'entry' ? (
                            <ReceiptText className="size-4.5" aria-hidden="true" />
                          ) : (
                            <Wallet className="size-4.5" aria-hidden="true" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.kind === 'entry' ? 'Marked paid' : 'Purchase'} · {item.detail}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {item.varianceCents !== null && item.varianceCents !== 0 && (
                          <Chip variant={item.varianceCents < 0 ? 'overdue' : 'success'}>
                            {item.varianceCents < 0 ? 'Over by' : 'Under by'} {formatCents(Math.abs(item.varianceCents))}
                          </Chip>
                        )}
                        <Money cents={item.amountCents} showPlus tone={item.amountCents > 0 ? 'income' : 'default'} className="text-sm font-semibold" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-6 md:col-span-2 xl:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold">Quick log</h2>
            </CardTitle>
            <CardDescription>Choose what you want to record.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-2 px-(--card-spacing)">
            <Button type="button" size="lg" className="h-10 justify-start" onClick={() => onLog({ mode: 'post' })}>
              Mark a bill paid
            </Button>
            <Button type="button" size="lg" variant="outline" className="h-10 justify-start" onClick={() => onLog({ mode: 'purchase' })}>
              Add a purchase
            </Button>
            <Button type="button" size="lg" variant="outline" className="h-10 justify-start" onClick={() => onLog({ mode: 'one-off' })}>
              Add a one-off
            </Button>
          </div>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="px-(--card-spacing) py-(--card-spacing)">
            <CardTitle>
              <h2 className="text-base font-semibold">Needs logging</h2>
            </CardTitle>
            <CardAction>
              <span className="text-sm text-muted-foreground">{pending.length} shown</span>
            </CardAction>
          </CardHeader>
          {pending.length === 0 ? (
            <p className="px-(--card-spacing) pb-(--card-spacing) text-sm text-muted-foreground">
              Nothing waiting to be logged.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {pending.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-(--card-spacing) py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium">{row.description}</span>
                      {row.status === 'overdue' && <Chip variant="overdue">Overdue</Chip>}
                    </div>
                    {row.dueText && <p className="text-xs text-muted-foreground">{row.dueText}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Money cents={row.amountCents} showPlus tone={row.amountCents > 0 ? 'income' : 'default'} className="text-sm font-semibold" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Post ${row.description}`}
                      onClick={() => onLog({ mode: 'post', entryRef: row.id })}
                    >
                      Post
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}