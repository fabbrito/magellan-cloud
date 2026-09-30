import type { Metric } from "@magellan/contract";

import type { Bucketing, Buckets } from "./bucket.ts";
import { scale, type Sample } from "./series.ts";

// What one metric's readings answer as, a point a reading or a bucket. Readings pass through scaled,
// a counter's raw value included: the cloud derives nothing from adjacent readings
// (docs/adr/0006-the-client-owns-presentation.md). A bucket averages a gauge and keeps the last value of
// a counter or a state.

export interface Point {
  ts: number;
  value: number;
}

type Reduce = (values: number[]) => number;

// A state's samples carry exponent 0, so its code passes through unscaled.
function scaledPoints(samples: Sample[]): Point[] {
  return samples.map((sample) => ({ ts: sample.ts, value: scale(sample.value, sample.exponent) }));
}

const mean: Reduce = (values) => values.reduce((total, value) => total + value, 0) / values.length;

const last: Reduce = (values) => {
  const value = values.at(-1);
  if (value === undefined) throw new Error("an empty bucket");
  return value;
};

// Points in ascending `ts`, so a bucket closes when a point passes its end and never reopens.
function bucketed(points: Point[], buckets: Buckets, reduce: Reduce): Point[] {
  const result: Point[] = [];
  let start = Number.NEGATIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let open: number[] = [];
  const close = () => {
    if (open.length === 0) return;
    result.push({ ts: start, value: reduce(open) });
  };
  for (const point of points) {
    if (point.ts >= end) {
      close();
      start = buckets.startOf(point.ts);
      end = buckets.endOf(start);
      open = [];
    }
    open.push(point.value);
  }
  close();
  return result;
}

export function pointsOf(metric: Metric, samples: Sample[], bucketing: Bucketing): Point[] {
  const points = scaledPoints(samples);
  if (bucketing.rollup === "reading") return points;

  const { buckets } = bucketing;
  switch (metric.kind) {
    case "gauge":
      return bucketed(points, buckets, mean);
    case "counter":
    case "state":
      return bucketed(points, buckets, last);
  }
}
