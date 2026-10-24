'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { SectionCard } from '@/components/ui/section-card';
import type { ChartPoint, CycleBoundary } from '@/lib/cycle-view-model';
import { niceTicksCents } from '@/lib/chart-ticks';
import { formatCents, formatMonthDay, formatWholeDollars } from '@/lib/format';
import { weekdayAbbr } from '@/lib/projection/dates';
import type { RunwayResult } from '@/lib/projection/types';

export interface BalanceChartProps {
  series: ChartPoint[];
  boundaries: CycleBoundary[];
  runway: RunwayResult | null;
  /** Workspace low-balance threshold (integer cents); null/undefined hides the band. */
  thresholdCents?: number | null;
  /** Shifted date of the next payday; drawn as a reference line when inside the series. */
  paydayDate?: string | null;
  className?: string;
}

// All colors come from CSS variable tokens in globals.css.
const C = {
  available: 'var(--chart-available)',
  ledger: 'var(--chart-ledger)',
  band: 'var(--chart-threshold)',
  runway: 'var(--chart-runway-dot)',
  today: 'var(--chart-today)',
  payday: 'var(--chart-payday)',
  grid: 'var(--chart-grid)',
  text: 'var(--muted-foreground)',
  strong: 'var(--foreground)',
  card: 'var(--card)',
} as const;

/** Plain-text description of the chart for assistive tech (Requirements 13.1, 9.2). */
export function describeChart({ series, boundaries, runway, thresholdCents }: BalanceChartProps): string {
  if (series.length === 0) return 'No balance data to chart.';

  const first = series[0];
  const last = series[series.length - 1];
  const parts = [
    `Projected available balance from ${formatMonthDay(first.date)} to ${formatMonthDay(last.date)}, ` +
      `starting at ${formatCents(first.availableCents)} and ending at ${formatCents(last.availableCents)}.`,
  ];
  if (runway) {
    parts.push(
      `Lowest available balance is ${formatCents(runway.lowestBalanceCents)} on ${formatMonthDay(runway.lowestBalanceDate)}.`,
    );
  }
  const highest = Math.max(...series.map((p) => p.availableCents));
  const lowest = Math.min(...series.map((p) => p.availableCents));
  parts.push(`Available balance ranges from ${formatCents(lowest)} to ${formatCents(highest)}.`);
  if (boundaries.length > 0) {
    parts.push(`Pay cycles start on ${boundaries.map((b) => formatMonthDay(b.date)).join(', ')}.`);
  }
  if (thresholdCents != null) {
    parts.push(`The shaded band marks balances below your ${formatCents(thresholdCents)} threshold.`);
  }
  parts.push('Ledger balance is shown as a dashed light-blue line.');
  return parts.join(' ');
}

/** Two-line label above a vertical reference line: name, then date. */
function lineLabel(name: string, date: string, color: string) {
  function LineLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
    const x = (viewBox?.x ?? 0) + 6;
    const y = viewBox?.y ?? 0;
    return (
      <g>
        <text x={x} y={y - 24} fontSize={12} fontWeight={600} fill={color}>
          {name}
        </text>
        <text x={x} y={y - 10} fontSize={11} fill={C.text}>
          {formatMonthDay(date)}
        </text>
      </g>
    );
  }
  return LineLabel;
}

interface DotShapeProps {
  cx?: number;
  cy?: number;
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {swatch}
      <span>{children}</span>
    </li>
  );
}

export function BalanceChart(props: BalanceChartProps) {
  const { series, runway, thresholdCents = null, paydayDate = null, className } = props;
  const summary = describeChart(props);

  if (series.length === 0) {
    return (
      <Card className={className}>
        <p className="px-(--card-spacing) text-muted-foreground">{summary}</p>
      </Card>
    );
  }

  const values = series.flatMap((p) => [p.availableCents, p.ledgerCents]);
  if (thresholdCents != null) values.push(thresholdCents);
  const ticks = niceTicksCents(Math.min(...values), Math.max(...values));
  const first = series[0];
  const runwayIndex = runway ? series.findIndex((p) => p.date === runway.lowestBalanceDate) : -1;
  const runwayPoint = runwayIndex >= 0 ? series[runwayIndex] : undefined;
  const labelOnLeft = runwayIndex > series.length * 0.6;
  const showPayday = paydayDate != null && paydayDate !== first.date && series.some((p) => p.date === paydayDate);

  return (
    <SectionCard
      id="balance-chart"
      title="Projected available balance"
      className={className}
      action={
        <ul aria-hidden="true" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <LegendItem swatch={<span className="block h-0.5 w-5 rounded-full bg-chart-available" />}>
            Available balance
          </LegendItem>
          <LegendItem swatch={<span className="block w-5 border-t-2 border-dashed border-chart-ledger" />}>
            Ledger balance
          </LegendItem>
          {thresholdCents != null && (
            <LegendItem swatch={<span className="block size-3 rounded-sm border border-chart-threshold bg-chart-threshold/15" />}>
              Below {formatWholeDollars(thresholdCents)} threshold
            </LegendItem>
          )}
        </ul>
      }
    >
      <figure>
        <div role="img" aria-label={summary} className="h-60 w-full md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 40, right: 24, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              {thresholdCents != null && (
                <ReferenceArea y1={ticks[0]} y2={thresholdCents} fill={C.band} fillOpacity={0.15} stroke="none" ifOverflow="hidden" />
              )}
              <XAxis
                dataKey="date"
                tickFormatter={formatMonthDay}
                minTickGap={28}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: C.text }}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={formatWholeDollars}
                width={52}
                ticks={ticks}
                domain={[ticks[0], ticks[ticks.length - 1]]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: C.text }}
              />
              <ReferenceLine
                x={first.date}
                stroke={C.today}
                strokeDasharray="4 4"
                label={lineLabel('Today', first.date, C.today)}
              />
              {showPayday && (
                <ReferenceLine
                  x={paydayDate}
                  stroke={C.payday}
                  strokeDasharray="4 4"
                  label={lineLabel('Payday', paydayDate, C.payday)}
                />
              )}
              <Line
                type="stepAfter"
                dataKey="availableCents"
                name="Available balance"
                stroke={C.available}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              {/* Drawn after available so the dashes stay visible where the lines overlap. */}
              <Line
                type="stepAfter"
                dataKey="ledgerCents"
                name="Ledger balance"
                stroke={C.ledger}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={first.date}
                y={first.availableCents}
                r={4.5}
                fill={C.available}
                stroke={C.card}
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
              {runway && runwayPoint && (
                <ReferenceDot
                  x={runway.lowestBalanceDate}
                  y={runwayPoint.availableCents}
                  ifOverflow="extendDomain"
                  shape={({ cx = 0, cy = 0 }: DotShapeProps) => (
                    <g>
                      <circle cx={cx} cy={cy} r={6} fill={C.runway} stroke={C.card} strokeWidth={2} />
                      <text
                        x={cx + (labelOnLeft ? -12 : 12)}
                        y={cy - 2}
                        textAnchor={labelOnLeft ? 'end' : 'start'}
                        fontSize={13}
                        fontWeight={700}
                        fill={C.strong}
                      >
                        {formatCents(runway.lowestBalanceCents)}
                      </text>
                      <text
                        x={cx + (labelOnLeft ? -12 : 12)}
                        y={cy + 13}
                        textAnchor={labelOnLeft ? 'end' : 'start'}
                        fontSize={11}
                        fill={C.text}
                      >
                        {`${weekdayAbbr(runway.lowestBalanceDate)}, ${formatMonthDay(runway.lowestBalanceDate)}`}
                      </text>
                    </g>
                  )}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="sr-only">{summary}</figcaption>
      </figure>
    </SectionCard>
  );
}
