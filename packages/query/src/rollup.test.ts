import type { Metric } from "@magellan/contract";
import { daysReadings, energyStep } from "@magellan/simulator";
import { describe, expect, it } from "vitest";

import { bucketsOf, hourMs } from "./bucket.ts";
import { pointsOf, type Point } from "./rollup.ts";
import { scale, type Sample } from "./series.ts";

const firstTs = Date.UTC(2026, 0, 1);
const quarterMs = hourMs / 4;

const gauge: Metric = { key: "power", kind: "gauge", unit: "W", exponent: -1 };
const state: Metric = { key: "mode", kind: "state" };
const counter: Metric = { key: "energy", kind: "counter", exponent: 0 };
const daily: Metric = { key: "energy_today", kind: "counter", exponent: -2, resets: "daily" };

const samplesOf = (values: number[], exponent: number, periodMs = quarterMs): Sample[] =>
  values.map((value, index) => ({ ts: firstTs + index * periodMs, exponent, value }));

const byReading = { rollup: "reading" } as const;
const hours = { rollup: "hour", buckets: bucketsOf("UTC", "hour") } as const;
const days = { rollup: "day", buckets: bucketsOf("UTC", "day") } as const;

// What a row answers: the time and value, not the precision the sum was rounded at.
const valuesOf = (points: Point[]) => points.map(({ ts, value }) => ({ ts, value }));

describe("by reading", () => {
  it("scales a gauge each reading", () => {
    expect(valuesOf(pointsOf(gauge, samplesOf([215, 220], -1), byReading))).toEqual([
      { ts: firstTs, value: 21.5 },
      { ts: firstTs + quarterMs, value: 22 },
    ]);
  });

  it("answers a counter's delta at the reading that ends it, null across a reset", () => {
    expect(valuesOf(pointsOf(counter, samplesOf([10, 15, 3], 0), byReading))).toEqual([
      { ts: firstTs + quarterMs, value: 5 },
      { ts: firstTs + 2 * quarterMs, value: null },
    ]);
  });

  it("passes a state's code through", () => {
    expect(valuesOf(pointsOf(state, samplesOf([3], 0), byReading))).toEqual([
      { ts: firstTs, value: 3 },
    ]);
  });
});

describe("by bucket", () => {
  it("averages a gauge over its hour", () => {
    expect(valuesOf(pointsOf(gauge, samplesOf([10, 20, 30, 40, 50], -1), hours))).toEqual([
      { ts: firstTs, value: 2.5 },
      { ts: firstTs + hourMs, value: 5 },
    ]);
  });

  it("keeps a state's last code in its hour", () => {
    expect(valuesOf(pointsOf(state, samplesOf([1, 2, 1, 3], 0), hours))).toEqual([
      { ts: firstTs, value: 3 },
    ]);
  });

  it("sums a counter's deltas into the hour each ends in", () => {
    expect(valuesOf(pointsOf(counter, samplesOf([0, 1, 2, 3, 4, 5], 0), hours))).toEqual([
      { ts: firstTs, value: 3 },
      { ts: firstTs + hourMs, value: 2 },
    ]);
  });

  it("answers null for an hour holding only a reset", () => {
    const readings = samplesOf([5, 6, 7, 8, 1], 0, quarterMs);

    expect(valuesOf(pointsOf(counter, readings, hours))).toEqual([
      { ts: firstTs, value: 3 },
      { ts: firstTs + hourMs, value: null },
    ]);
  });

  it("totals a daily counter's day by its segment", () => {
    const periodMs = 6 * hourMs;
    const readings = daysReadings({ firstTs, periodMs, readingsPerDay: 4, days: 2 }).map(
      (reading) => ({ ts: reading.ts, exponent: -2, value: reading.values["energy_today"] ?? 0 }),
    );
    const dayTotal = scale(4 * energyStep, -2);

    expect(valuesOf(pointsOf(daily, readings, days))).toEqual([
      { ts: firstTs, value: dayTotal },
      { ts: firstTs + 4 * periodMs, value: dayTotal },
    ]);
  });

  it("sums a daily counter's deltas by the hour", () => {
    expect(valuesOf(pointsOf(daily, samplesOf([100, 200], -2), hours))).toEqual([
      { ts: firstTs, value: 1 },
    ]);
  });

  it("sums without float error: 0.1 + 0.2 is 0.3", () => {
    const tenths = samplesOf([0, 1, 3], -1);

    expect(valuesOf(pointsOf(counter, tenths, hours))).toEqual([{ ts: firstTs, value: 0.3 }]);
  });

  it("has no bucket without readings", () => {
    expect(valuesOf(pointsOf(gauge, [], days))).toEqual([]);
  });
});
