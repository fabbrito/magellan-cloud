import type { Interval, Metric, Point, Run, Segment } from "@magellan/query/api";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/client/components/ui/chart";
import {
  formatDateTime,
  formatDay,
  formatTime,
  formatValue,
  stateLabel,
} from "~/client/lib/format";
import { spansOf, stateSlot } from "~/client/lib/series";

// One series per card, always slot 1.
const config = { value: { label: "Value", color: "var(--chart-1)" } } satisfies ChartConfig;

function tooltip(metric: Metric) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          hideIndicator
          labelFormatter={(_, payload) => {
            const ts: unknown = payload[0]?.payload?.ts;
            return typeof ts === "number" ? formatDateTime(ts) : null;
          }}
          formatter={(value) => (typeof value === "number" ? formatValue(value, metric) : null)}
        />
      }
    />
  );
}

export function GaugeChart({ metric, points }: { metric: Metric; points: Point[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <LineChart data={points} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatTime}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
        />
        <YAxis tickLine={false} axisLine={false} width={48} />
        {tooltip(metric)}
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

// A bar per interval between readings, then each segment's total: for a daily counter, a day's.
export function CounterChart({
  metric,
  intervals,
  segments,
}: {
  metric: Metric;
  intervals: Interval[];
  segments: Segment[];
}) {
  const bars = intervals.map((interval) => ({ ts: interval.end, value: interval.delta }));
  const daily = metric.kind === "counter" && metric.resets === "daily";
  return (
    <div className="flex flex-col gap-3">
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <BarChart data={bars} margin={{ left: 4, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={formatTime}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis tickLine={false} axisLine={false} width={48} />
          {tooltip(metric)}
          <Bar dataKey="value" fill="var(--color-value)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {segments.map((segment) => (
          <div key={segment.end} className="flex gap-2">
            <dt className="text-muted-foreground">
              {daily ? formatDay(segment.end) : `to ${formatDateTime(segment.end)}`}
            </dt>
            <dd className="font-medium tabular-nums">{formatValue(segment.total, metric)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Held states as stacked runs across the range, each labelled as the manifest names it.
export function StateTimeline({ metric, runs }: { metric: Metric; runs: Run[] }) {
  const spans = spansOf(runs);
  const codes = [...new Set(runs.map((run) => run.code))];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {spans.map(({ run, width }) => (
          <div
            key={run.start}
            title={`${stateLabel(metric, run.code)} · ${formatDateTime(run.start)} – ${formatDateTime(run.end)}`}
            className="min-w-0.5"
            style={{ width: `${width * 100}%`, background: `var(--chart-${stateSlot(run.code)})` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {codes.map((code) => (
          <li key={code} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: `var(--chart-${stateSlot(code)})` }}
            />
            {stateLabel(metric, code)}
          </li>
        ))}
      </ul>
    </div>
  );
}
