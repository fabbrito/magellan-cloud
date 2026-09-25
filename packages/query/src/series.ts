import { pairs } from "./pairs.ts";

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

// A counter's change between two adjacent readings.
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

// Any decrease is a reset, declared or not (docs/adr/0005-the-device-owns-meaning.md). Under one
// exponent the integers compare, exact past what scaling keeps.
function resets(previous: Sample, current: Sample): boolean {
  if (previous.exponent === current.exponent) return current.value < previous.value;
  return scale(current.value, current.exponent) < scale(previous.value, previous.exponent);
}

// Integers subtract exactly; scaling once keeps the delta as exact as the values.
function delta(previous: Sample, current: Sample): number {
  if (previous.exponent === current.exponent) {
    return scale(current.value - previous.value, current.exponent);
  }
  return scale(current.value, current.exponent) - scale(previous.value, previous.exponent);
}

const silenceSpanFactor = 2;

// The contract carries no reading period; a median span survives a few silences.
function silenceSpanMs(samples: Sample[]): number {
  const spans = pairs(samples)
    .map(([previous, current]) => current.ts - previous.ts)
    .toSorted((left, right) => left - right);
  const median = spans[Math.floor(spans.length / 2)] ?? 0;
  return silenceSpanFactor * median;
}

// None across a reset or a silence (docs/CONTEXT.md > Reset).
export function counterIntervals(samples: Sample[]): Interval[] {
  const spanMaxMs = silenceSpanMs(samples);
  const intervals: Interval[] = [];
  for (const [previous, current] of pairs(samples)) {
    if (resets(previous, current)) continue;
    if (current.ts - previous.ts > spanMaxMs) continue;
    intervals.push({ start: previous.ts, end: current.ts, delta: delta(previous, current) });
  }
  return intervals;
}

export function counterSegments(samples: Sample[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    if (current === undefined) throw new Error("index past samples");

    const next = samples[index + 1];
    const last = next === undefined;
    if (last || resets(current, next)) {
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
