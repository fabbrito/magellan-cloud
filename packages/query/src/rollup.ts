import type { Metric } from "@magellan/contract";

import type { Bucketing, Buckets } from "./bucket.ts";
import { counterIntervals, counterSegments, roundTo, scale, type Sample } from "./series.ts";

// What one metric's readings answer as, a point a reading or a bucket. The kind decides the
// aggregate: a gauge averages, a state keeps its last code, a counter sums its deltas — none across a
// reset or a silence, so a bucket holding only those answers null. A daily counter's day is its
// segment total instead, which counts what accrued across a silence too.

// `exponent` is the finest decimal the value is exact to, so a sum can shed its float error.
export interface Point {
  ts: number;
  value: number | null;
  exponent: number;
}

type Reduce = (points: Point[]) => number | null;

// A state's samples carry exponent 0, so its code passes through unscaled.
function scaledPoints(samples: Sample[]): Point[] {
  return samples.map((sample) => ({
    ts: sample.ts,
    value: scale(sample.value, sample.exponent),
    exponent: sample.exponent,
  }));
}

// Each delta at the reading that ends it.
function deltaPoints(samples: Sample[]): Point[] {
  return counterIntervals(samples).map((interval) => ({
    ts: interval.end,
    value: interval.delta,
    exponent: interval.exponent,
  }));
}

function segmentPoints(samples: Sample[]): Point[] {
  return counterSegments(samples).map((segment) => ({
    ts: segment.end,
    value: segment.total,
    exponent: segment.exponent,
  }));
}

function finestExponent(points: Point[]): number {
  return points.reduce((finest, point) => Math.min(finest, point.exponent), 0);
}

// The known values, or undefined where every one is null.
function known(points: Point[]): number[] | undefined {
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  return values.length === 0 ? undefined : values;
}

const sum: Reduce = (points) => {
  const values = known(points);
  if (values === undefined) return null;
  const total = values.reduce((accrued, value) => accrued + value, 0);
  return roundTo(total, finestExponent(points));
};

// Not rounded: an average of whole numbers is rightly finer than they are.
const mean: Reduce = (points) => {
  const values = known(points);
  if (values === undefined) return null;
  return values.reduce((accrued, value) => accrued + value, 0) / values.length;
};

const last: Reduce = (points) => points.at(-1)?.value ?? null;

// Points in ascending `ts`, so a bucket closes when a point passes its end and never reopens.
function bucketed(points: Point[], buckets: Buckets, reduce: Reduce): Point[] {
  const result: Point[] = [];
  let start = Number.NEGATIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let open: Point[] = [];
  const close = () => {
    if (open.length === 0) return;
    result.push({ ts: start, value: reduce(open), exponent: finestExponent(open) });
  };
  for (const point of points) {
    if (point.ts >= end) {
      close();
      start = buckets.startOf(point.ts);
      end = buckets.endOf(start);
      open = [];
    }
    open.push(point);
  }
  close();
  return result;
}

export function pointsOf(metric: Metric, samples: Sample[], bucketing: Bucketing): Point[] {
  if (bucketing.rollup === "reading") {
    if (metric.kind === "counter") return deltaPoints(samples);
    return scaledPoints(samples);
  }

  const { buckets } = bucketing;
  switch (metric.kind) {
    case "gauge":
      return bucketed(scaledPoints(samples), buckets, mean);
    case "state":
      return bucketed(scaledPoints(samples), buckets, last);
    case "counter": {
      if (bucketing.rollup === "day" && metric.resets === "daily") {
        return bucketed(segmentPoints(samples), buckets, sum);
      }
      return bucketed(deltaPoints(samples), buckets, sum);
    }
  }
}
