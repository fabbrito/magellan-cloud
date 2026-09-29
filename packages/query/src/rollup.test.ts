import type { Metric } from "@magellan/contract";
import { daysReadings, energyStep } from "@magellan/simulator";
import { describe, expect, it } from "vitest";

import { bucketsOf, hourMs } from "./bucket.ts";
import { bucketPoints, readingPoints } from "./rollup.ts";
import { scale, type Sample } from "./series.ts";

const firstTs = Date.UTC(2026, 0, 1);
const quarterMs = hourMs / 4;

const gauge: Metric = { key: "power", kind: "gauge", unit: "W", exponent: -1 };
const state: Metric = { key: "mode", kind: "state" };
const counter: Metric = { key: "energy", kind: "counter", exponent: 0 };
const daily: Metric = { key: "energy_today", kind: "counter", exponent: -2, resets: "daily" };

const samplesOf = (values: number[], exponent: number, periodMs = quarterMs): Sample[] =>
  values.map((value, index) => ({ ts: firstTs + index * periodMs, exponent, value }));

const hours = bucketsOf("UTC", "hour");
const days = bucketsOf("UTC", "day");

describe("readingPoints", () => {
  it("scales a gauge each reading", () => {
    expect(readingPoints(gauge, samplesOf([215, 220], -1))).toEqual([
      { ts: firstTs, value: 21.5 },
      { ts: firstTs + quarterMs, value: 22 },
    ]);
  });

  it("answers a counter's delta at the reading that ends it, null across a reset", () => {
    expect(readingPoints(counter, samplesOf([10, 15, 3], 0))).toEqual([
      { ts: firstTs + quarterMs, value: 5 },
      { ts: firstTs + 2 * quarterMs, value: null },
    ]);
  });

  it("passes a state's code through", () => {
    expect(readingPoints(state, samplesOf([3], 0))).toEqual([{ ts: firstTs, value: 3 }]);
  });
});

describe("bucketPoints", () => {
  it("averages a gauge over its hour", () => {
    expect(bucketPoints(gauge, samplesOf([10, 20, 30, 40, 50], -1), "hour", hours)).toEqual([
      { ts: firstTs, value: 2.5 },
      { ts: firstTs + hourMs, value: 5 },
    ]);
  });

  it("keeps a state's last code in its hour", () => {
    expect(bucketPoints(state, samplesOf([1, 2, 1, 3], 0), "hour", hours)).toEqual([
      { ts: firstTs, value: 3 },
    ]);
  });

  it("sums a counter's deltas into the hour each ends in", () => {
    expect(bucketPoints(counter, samplesOf([0, 1, 2, 3, 4, 5], 0), "hour", hours)).toEqual([
      { ts: firstTs, value: 3 },
      { ts: firstTs + hourMs, value: 2 },
    ]);
  });

  it("answers null for an hour holding only a reset", () => {
    const readings = samplesOf([5, 6, 7, 8, 1], 0, quarterMs);

    expect(bucketPoints(counter, readings, "hour", hours)).toEqual([
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

    expect(bucketPoints(daily, readings, "day", days)).toEqual([
      { ts: firstTs, value: dayTotal },
      { ts: firstTs + 4 * periodMs, value: dayTotal },
    ]);
  });

  it("sums a daily counter's deltas by the hour", () => {
    expect(bucketPoints(daily, samplesOf([100, 200], -2), "hour", hours)).toEqual([
      { ts: firstTs, value: 1 },
    ]);
  });

  it("has no bucket without readings", () => {
    expect(bucketPoints(gauge, [], "day", days)).toEqual([]);
  });
});
