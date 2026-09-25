import type { Metric, Run, Series } from "@magellan/query/api";

import { formatValue, stateLabel } from "./format.ts";

// What a tile shows: the latest value, or undefined before the first reading in range. A counter's
// latest segment total is today's so far when it resets daily, its running total otherwise.
export function latestOf(series: Series): string | undefined {
  const { data, metric } = series;
  switch (data.kind) {
    case "gauge": {
      const point = data.points.at(-1);
      return point === undefined ? undefined : formatValue(point.value, metric);
    }
    case "counter": {
      const segment = data.segments.at(-1);
      return segment === undefined ? undefined : formatValue(segment.total, metric);
    }
    case "state": {
      const run = data.runs.at(-1);
      return run === undefined ? undefined : stateLabel(metric, run.code);
    }
  }
}

// A daily counter's latest segment is today's total so far.
export function resetsDaily(metric: Metric): boolean {
  if (metric.kind !== "counter") return false;
  return metric.resets === "daily";
}

export interface Span {
  run: Run;
  // Of the timeline, 0..1.
  share: number;
}

// Runs as shares of the time they cover. A run with no duration — a single reading — still gets a
// sliver, so a state held once stays visible.
export function spansOf(runs: Run[]): Span[] {
  const first = runs[0];
  const last = runs.at(-1);
  if (first === undefined) return [];
  if (last === undefined) return [];
  const totalMs = last.end - first.start;
  if (totalMs <= 0) return runs.map((run) => ({ run, share: 1 / runs.length }));
  return runs.map((run) => ({ run, share: Math.max(run.end - run.start, 0) / totalMs }));
}

// A stable colour slot per state code, so a code keeps its colour across cards and refetches.
export function stateSlot(code: number): number {
  const slots = 5;
  return (((code % slots) + slots) % slots) + 1;
}
