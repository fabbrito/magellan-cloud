import { pairs } from "./pairs.ts";

// Scaling and a counter's arithmetic over one metric's readings. Pure: the rows come in resolved,
// each value beside the exponent of the manifest it was read under, so a metric re-scaled mid-range
// charts each value by its own (docs/adr/0002-integer-values.md).
//
// Every function takes samples in ascending `ts`, the order the query returns them in.

export interface Sample {
  ts: number;
  exponent: number;
  value: number;
}

// A counter's change between two adjacent readings; null across a reset or a silence, where it has
// no known delta (docs/CONTEXT.md > Reset).
export interface Interval {
  start: number;
  end: number;
  delta: number | null;
}

// A counter's value just before it reset, or its latest: for a daily counter, one day's total.
export interface Segment {
  end: number;
  total: number;
}

// Dividing by an exact power of ten rounds once; multiplying by 10^-n would round the factor first.
export function scale(value: number, exponent: number): number {
  if (exponent < 0) return value / 10 ** -exponent;
  return value * 10 ** exponent;
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

export function counterIntervals(samples: Sample[]): Interval[] {
  const spanMaxMs = silenceSpanMs(samples);
  return pairs(samples).map(([previous, current]) => {
    const known = !resets(previous, current) && current.ts - previous.ts <= spanMaxMs;
    return { start: previous.ts, end: current.ts, delta: known ? delta(previous, current) : null };
  });
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
