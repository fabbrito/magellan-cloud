import type { Metric } from "@magellan/contract";

import { scale, type Sample } from "./series.ts";

// What one metric's readings answer as, a point a reading or a bucket. Readings pass through scaled,
// a counter's raw value included: the cloud derives nothing from adjacent readings
// (docs/adr/0006-the-client-owns-presentation.md). A bucket averages a gauge and keeps the last value of
// a counter or a state.

export interface Point {
  ts: number;
  value: number;
}

// A state's samples carry exponent 0, so its code passes through unscaled.
export function readingPoints(samples: Sample[]): Point[] {
  return samples.map((sample) => ({ ts: sample.ts, value: scale(sample.value, sample.exponent) }));
}

// One metric's bucket as D1 aggregated it under one manifest, beside that manifest's exponent.
export interface BucketGroup {
  start: number;
  exponent: number;
  total: number;
  count: number;
  lastTs: number;
  last: number;
}

type Reduce = (groups: BucketGroup[]) => number;

// Each manifest's sum scaled by its own exponent, so a bucket straddling a re-scale weighs every
// reading once, by the exponent it was read under.
const mean: Reduce = (groups) =>
  groups.reduce((total, group) => total + scale(group.total, group.exponent), 0) /
  groups.reduce((count, group) => count + group.count, 0);

const last: Reduce = (groups) => {
  const [first, ...rest] = groups;
  if (first === undefined) throw new Error("an empty bucket");
  const latest = rest.reduce((kept, group) => (group.lastTs > kept.lastTs ? group : kept), first);
  return scale(latest.last, latest.exponent);
};

interface Run {
  start: number;
  groups: BucketGroup[];
}

// Groups in ascending `start`, so one bucket's are adjacent.
function runsOf(groups: BucketGroup[]): Run[] {
  const runs: Run[] = [];
  for (const group of groups) {
    const run = runs.at(-1);
    if (run?.start === group.start) run.groups.push(group);
    else runs.push({ start: group.start, groups: [group] });
  }
  return runs;
}

function reduceOf(metric: Metric): Reduce {
  switch (metric.kind) {
    case "gauge":
      return mean;
    case "counter":
    case "state":
      return last;
  }
}

export function bucketPoints(metric: Metric, groups: BucketGroup[]): Point[] {
  const reduce = reduceOf(metric);
  return runsOf(groups).map((run) => ({ ts: run.start, value: reduce(run.groups) }));
}
