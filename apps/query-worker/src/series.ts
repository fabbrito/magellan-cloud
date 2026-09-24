// What a chart draws, from one metric's readings. Pure: the rows come in resolved, each value beside
// the exponent of the manifest it was read under, so a metric re-scaled mid-range charts each value
// by its own (docs/adr/0002-integer-values.md).
//
// Every function takes samples in ascending `ts`, the order the query returns them in.

export interface Sample {
  ts: number;
  exponent: number;
  value: number;
}

export interface Point {
  ts: number;
  value: number;
}

// A counter's change over one interval between two readings.
export interface Interval {
  start: number;
  end: number;
  delta: number;
}

// A counter's value just before it reset, or its latest: for a daily counter, one day's total.
export interface Segment {
  end: number;
  total: number;
}

// A state held from `start` until the reading that changed it, or until the last reading.
export interface Run {
  start: number;
  end: number;
  code: number;
}

// Dividing by an exact power of ten rounds once; multiplying by 10^-n would round the factor first.
export function scale(value: number, exponent: number): number {
  if (exponent < 0) return value / 10 ** -exponent;
  return value * 10 ** exponent;
}

export function gaugePoints(samples: Sample[]): Point[] {
  return samples.map((sample) => ({ ts: sample.ts, value: scale(sample.value, sample.exponent) }));
}

// Any decrease is a reset, declared or not: the delta across one is the value after it, which is
// what accrued since (docs/adr/0005-the-device-owns-meaning.md). Under one exponent the difference
// is taken in integers and scaled once, so a delta is as exact as the values.
function delta(previous: Sample, current: Sample): number {
  if (previous.exponent === current.exponent) {
    if (current.value >= previous.value) {
      return scale(current.value - previous.value, current.exponent);
    }
    return scale(current.value, current.exponent);
  }

  const before = scale(previous.value, previous.exponent);
  const after = scale(current.value, current.exponent);
  if (after >= before) return after - before;
  return after;
}

export function counterIntervals(samples: Sample[]): Interval[] {
  const intervals: Interval[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous === undefined || current === undefined) throw new Error("index past samples");

    intervals.push({ start: previous.ts, end: current.ts, delta: delta(previous, current) });
  }
  return intervals;
}

function decreases(previous: Sample, current: Sample): boolean {
  return scale(current.value, current.exponent) < scale(previous.value, previous.exponent);
}

export function counterSegments(samples: Sample[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    if (current === undefined) throw new Error("index past samples");

    const next = samples[index + 1];
    const last = next === undefined;
    if (last || decreases(current, next)) {
      segments.push({ end: current.ts, total: scale(current.value, current.exponent) });
    }
  }
  return segments;
}

// A code is not scaled: a state has no exponent, and its value is the code.
export function stateRuns(samples: Sample[]): Run[] {
  const runs: Run[] = [];
  for (const sample of samples) {
    const open = runs.at(-1);
    if (open !== undefined) open.end = sample.ts;

    if (open === undefined || open.code !== sample.value) {
      runs.push({ start: sample.ts, end: sample.ts, code: sample.value });
    }
  }
  return runs;
}
