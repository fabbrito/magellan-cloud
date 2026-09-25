import { daysReadings, energyStep } from "@magellan/simulator";
import { describe, expect, it } from "vitest";

import {
  counterIntervals,
  counterSegments,
  gaugePoints,
  scale,
  stateRuns,
  type Sample,
} from "./series.ts";

const periodMs = 300_000;
const firstTs = Date.UTC(2026, 0, 1);

function samplesOf(values: number[], exponent: number): Sample[] {
  return values.map((value, index) => ({ ts: firstTs + index * periodMs, exponent, value }));
}

// An hour on, as if the device went quiet.
const later = (sample: Sample): Sample => ({ ...sample, ts: sample.ts + 12 * periodMs });

// Two days of the simulator's daily counter, at the exponent the device declares.
const days: Sample[] = daysReadings({ firstTs, periodMs, readingsPerDay: 4, days: 2 }).map(
  (reading) => ({ ts: reading.ts, exponent: -2, value: reading.values["energy_today"] ?? 0 }),
);

describe("scale", () => {
  it("scales down by an exact power of ten", () => {
    expect(scale(1234, -2)).toBe(12.34);
  });

  it("scales up", () => {
    expect(scale(12, 3)).toBe(12_000);
  });
});

describe("gaugePoints", () => {
  it("scales each value by its own exponent", () => {
    const rescaled = [
      ...samplesOf([215], -1),
      { ts: firstTs + periodMs, exponent: -2, value: 2150 },
    ];

    expect(gaugePoints(rescaled).map((point) => point.value)).toEqual([21.5, 21.5]);
  });
});

describe("counterIntervals", () => {
  it("takes one step a reading, with no interval across the daily reset", () => {
    const intervals = counterIntervals(days);

    expect(intervals.map((interval) => interval.delta)).toEqual(
      Array.from({ length: 6 }, () => scale(energyStep, -2)),
    );
    expect(intervals.map((interval) => interval.end)).not.toContain(firstTs + 4 * periodMs);
  });

  it("spans the readings it is between", () => {
    expect(counterIntervals(samplesOf([1, 3], 0))).toEqual([
      { start: firstTs, end: firstTs + periodMs, delta: 2 },
    ]);
  });

  it("reads an undeclared decrease as a reset", () => {
    expect(
      counterIntervals(samplesOf([900, 950, 20, 30], 0)).map((interval) => interval.delta),
    ).toEqual([50, 10]);
  });

  // Regression: a device up mid-day drew its whole morning as one bar.
  it("has no interval across a silence in the readings", () => {
    const resumed = [...samplesOf([0, 5, 10], 0), ...samplesOf([2000, 2005], 0).map(later)];

    expect(counterIntervals(resumed).map((interval) => interval.delta)).toEqual([5, 5, 5]);
  });

  it("takes a sparse device's usual span for usual, not for a silence", () => {
    const hourly = [0, 1, 2].map((value) => ({
      ts: firstTs + value * 12 * periodMs,
      exponent: 0,
      value,
    }));

    expect(counterIntervals(hourly).map((interval) => interval.delta)).toEqual([1, 1]);
  });

  it("takes a delta across a re-scale in physical units", () => {
    const rescaled = [
      ...samplesOf([100], -1),
      { ts: firstTs + periodMs, exponent: -2, value: 1050 },
    ];

    expect(counterIntervals(rescaled).map((interval) => interval.delta)).toEqual([0.5]);
  });

  it("finds a reset in physical units, where the integer grew", () => {
    const rescaled = [
      ...samplesOf([105], -1),
      { ts: firstTs + periodMs, exponent: -2, value: 1040 },
    ];

    expect(counterIntervals(rescaled)).toEqual([]);
  });

  it("has nothing to say about one reading", () => {
    expect(counterIntervals(samplesOf([5], 0))).toEqual([]);
  });
});

describe("counterSegments", () => {
  it("totals each day at its last reading before the reset", () => {
    const dayTotal = scale(4 * energyStep, -2);

    expect(counterSegments(days)).toEqual([
      { end: firstTs + 3 * periodMs, total: dayTotal },
      { end: firstTs + 7 * periodMs, total: dayTotal },
    ]);
  });

  it("ends with the running value", () => {
    expect(counterSegments(samplesOf([1, 2, 3], 0))).toEqual([
      { end: firstTs + 2 * periodMs, total: 3 },
    ]);
  });

  it("has no segment without readings", () => {
    expect(counterSegments([])).toEqual([]);
  });
});

describe("stateRuns", () => {
  it("holds a code until the reading that changes it", () => {
    expect(stateRuns(samplesOf([1, 1, 2, 1], 0))).toEqual([
      { start: firstTs, end: firstTs + 2 * periodMs, code: 1 },
      { start: firstTs + 2 * periodMs, end: firstTs + 3 * periodMs, code: 2 },
      { start: firstTs + 3 * periodMs, end: firstTs + 3 * periodMs, code: 1 },
    ]);
  });
});
