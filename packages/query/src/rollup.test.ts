import type { Metric } from "@magellan/contract";
import { daysReadings, energyStep } from "@magellan/simulator";
import { describe, expect, it } from "vitest";

import { bucketsOf, hourMs } from "./bucket.ts";
import { pointsOf } from "./rollup.ts";
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

describe("by reading", () => {
  it("scales a gauge each reading", () => {
    expect(pointsOf(gauge, samplesOf([215, 220], -1), byReading)).toEqual([
      { ts: firstTs, value: 21.5 },
      { ts: firstTs + quarterMs, value: 22 },
    ]);
  });

  it("answers a counter's raw value each reading, a reset included", () => {
    expect(pointsOf(counter, samplesOf([10, 15, 3], 0), byReading)).toEqual([
      { ts: firstTs, value: 10 },
      { ts: firstTs + quarterMs, value: 15 },
      { ts: firstTs + 2 * quarterMs, value: 3 },
    ]);
  });

  it("passes a state's code through", () => {
    expect(pointsOf(state, samplesOf([3], 0), byReading)).toEqual([{ ts: firstTs, value: 3 }]);
  });
});

describe("by bucket", () => {
  it("averages a gauge over its hour", () => {
    expect(pointsOf(gauge, samplesOf([10, 20, 30, 40, 50], -1), hours)).toEqual([
      { ts: firstTs, value: 2.5 },
      { ts: firstTs + hourMs, value: 5 },
    ]);
  });

  it("keeps a state's last code in its hour", () => {
    expect(pointsOf(state, samplesOf([1, 2, 1, 3], 0), hours)).toEqual([{ ts: firstTs, value: 3 }]);
  });

  it("keeps a counter's last value in its hour", () => {
    expect(pointsOf(counter, samplesOf([0, 1, 2, 3, 4, 5], 0), hours)).toEqual([
      { ts: firstTs, value: 3 },
      { ts: firstTs + hourMs, value: 5 },
    ]);
  });

  it("keeps a counter's last value across a reset, not a total", () => {
    expect(pointsOf(counter, samplesOf([5, 6, 7, 1], 0), hours)).toEqual([
      { ts: firstTs, value: 1 },
    ]);
  });

  it("keeps a daily counter's last reading in its day", () => {
    const periodMs = 6 * hourMs;
    const readings = daysReadings({ firstTs, periodMs, readingsPerDay: 4, days: 2 }).map(
      (reading) => ({ ts: reading.ts, exponent: -2, value: reading.values["energy_today"] ?? 0 }),
    );
    const dayLast = scale(4 * energyStep, -2);

    expect(pointsOf(daily, readings, days)).toEqual([
      { ts: firstTs, value: dayLast },
      { ts: firstTs + 4 * periodMs, value: dayLast },
    ]);
  });

  it("has no bucket without readings", () => {
    expect(pointsOf(gauge, [], days)).toEqual([]);
  });
});
