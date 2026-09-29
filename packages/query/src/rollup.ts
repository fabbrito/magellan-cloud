import type { Metric } from "@magellan/contract";

import type { Buckets } from "./bucket.ts";
import { counterIntervals, counterSegments, scale, type Sample } from "./series.ts";

// What one metric's readings answer as, a point a reading or a bucket. The kind decides the
// aggregate: a gauge averages, a state keeps its last code, a counter sums its deltas — none across a
// reset or a silence, so a bucket holding only those answers null. A daily counter's day is its
// segment total instead, which counts what accrued across a silence too.

export interface Point {
  ts: number;
  value: number | null;
}

type Reduce = (values: (number | null)[]) => number | null;

// A state's samples carry exponent 0, so its code passes through unscaled.
function scaledPoints(samples: Sample[]): Point[] {
  return samples.map((sample) => ({ ts: sample.ts, value: scale(sample.value, sample.exponent) }));
}

// Each delta at the reading that ends it.
function deltaPoints(samples: Sample[]): Point[] {
  return counterIntervals(samples).map((interval) => ({ ts: interval.end, value: interval.delta }));
}

export function readingPoints(metric: Metric, samples: Sample[]): Point[] {
  if (metric.kind === "counter") return deltaPoints(samples);
  return scaledPoints(samples);
}

const mean: Reduce = (values) => {
  const known = values.filter((value) => value !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
};

const last: Reduce = (values) => values.at(-1) ?? null;

const sum: Reduce = (values) => {
  const known = values.filter((value) => value !== null);
  if (known.length === 0) return null;
  return known.reduce((total, value) => total + value, 0);
};

// Points in ascending `ts`, so a bucket closes when a point passes its end and never reopens.
function bucketed(points: Point[], buckets: Buckets, reduce: Reduce): Point[] {
  const result: Point[] = [];
  let start = Number.NEGATIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let values: (number | null)[] = [];
  for (const point of points) {
    if (point.ts >= end) {
      if (values.length > 0) result.push({ ts: start, value: reduce(values) });
      start = buckets.startOf(point.ts);
      end = buckets.endOf(start);
      values = [];
    }
    values.push(point.value);
  }
  if (values.length > 0) result.push({ ts: start, value: reduce(values) });
  return result;
}

export function bucketPoints(
  metric: Metric,
  samples: Sample[],
  rollup: "hour" | "day",
  buckets: Buckets,
): Point[] {
  switch (metric.kind) {
    case "gauge":
      return bucketed(scaledPoints(samples), buckets, mean);
    case "state":
      return bucketed(scaledPoints(samples), buckets, last);
    case "counter": {
      if (rollup === "day" && metric.resets === "daily") {
        const segments = counterSegments(samples);
        const points = segments.map((segment) => ({ ts: segment.end, value: segment.total }));
        return bucketed(points, buckets, sum);
      }
      return bucketed(deltaPoints(samples), buckets, sum);
    }
  }
}
