'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint, CycleBoundary } from '@/lib/cycle-view-model';
import { formatCents, formatMonthDay, formatWholeDollars } from '@/lib/format';
import type { RunwayResult } from '@/lib/projection/types';

export interface BalanceChartProps {
  series: ChartPoint[];
  boundaries: CycleBoundary[];
  runway: RunwayResult | null;
}

const AVAILABLE_COLOR = '#2563eb';
const LEDGER_COLOR = '#64748b';
const RUNWAY_COLOR = '#dc2626';

/** Plain-text description of the chart for assistive tech (Requirements 13.1, 9.2). */
export function describeChart({ series, boundaries, runway }: BalanceChartProps): string {
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
  parts.push('Ledger balance is shown as a lighter dashed line.');
  return parts.join(' ');
}

export function BalanceChart(props: BalanceChartProps) {
  const { series, boundaries, runway } = props;
  const summary = describeChart(props);

  if (series.length === 0) {
    return <p className="text-muted-foreground">{summary}</p>;
  }

  const runwayPoint = runway ? series.find((p) => p.date === runway.lowestBalanceDate) : undefined;

  return (
    <figure className="space-y-2">
      <div role="img" aria-label={summary} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 12, right: 16, bottom: 4, left: 8 }} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="date" tickFormatter={formatMonthDay} minTickGap={24} />
            <YAxis tickFormatter={formatWholeDollars} width={64} />
            <Line
              type="monotone"
              dataKey="ledgerCents"
              name="Ledger"
              stroke={LEDGER_COLOR}
              strokeWidth={1}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="availableCents"
              name="Available"
              stroke={AVAILABLE_COLOR}
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
            {boundaries.map((b) => (
              <ReferenceLine
                key={b.date}
                x={b.date}
                stroke={LEDGER_COLOR}
                strokeDasharray="2 4"
                label={{ value: 'Payday', position: 'insideTopRight', fontSize: 11 }}
              />
            ))}
            {runway && runwayPoint && (
              <ReferenceDot
                x={runway.lowestBalanceDate}
                y={runwayPoint.availableCents}
                r={6}
                fill={RUNWAY_COLOR}
                stroke="#ffffff"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted-foreground">{summary}</figcaption>
    </figure>
  );
}
