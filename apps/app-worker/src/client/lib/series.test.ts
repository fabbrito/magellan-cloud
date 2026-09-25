import type { Metric, Series } from "@magellan/query/api";
import { describe, expect, it } from "vitest";

import { latestOf, resetsDaily, spansOf, stateSlot } from "./series.ts";

const gauge: Metric = { key: "power", kind: "gauge", unit: "W", exponent: 0 };
const counter: Metric = {
  key: "energy_today",
  kind: "counter",
  unit: "kWh",
  exponent: -2,
  resets: "daily",
};
const state: Metric = { key: "mode", kind: "state", state_labels: { "1": "running" } };

const series = (metric: Metric, data: Series["data"]): Series => ({ metric, declared: true, data });

describe("latestOf", () => {
  it("reads a gauge's last point", () => {
    const points = [
      { ts: 1, value: 10 },
      { ts: 2, value: 20 },
    ];
    expect(latestOf(series(gauge, { kind: "gauge", points }))).toBe("20 W");
  });

  it("reads a counter's last segment total, not its last interval", () => {
    const data = {
      kind: "counter" as const,
      intervals: [{ start: 1, end: 2, delta: 0.5 }],
      segments: [
        { end: 1, total: 4 },
        { end: 2, total: 1.5 },
      ],
    };
    expect(latestOf(series(counter, data))).toMatch(/^1[.,]50 kWh$/);
  });

  it("names a state by its label, else its code", () => {
    const runs = [
      { start: 1, end: 2, code: 3 },
      { start: 2, end: 3, code: 1 },
    ];
    expect(latestOf(series(state, { kind: "state", runs }))).toBe("running");
    expect(latestOf(series(state, { kind: "state", runs: runs.slice(0, 1) }))).toBe("3");
  });

  it("has nothing before the first reading", () => {
    expect(latestOf(series(gauge, { kind: "gauge", points: [] }))).toBeUndefined();
  });
});

describe("spansOf", () => {
  it("sizes each run by the time it held", () => {
    const spans = spansOf([
      { start: 0, end: 30, code: 1 },
      { start: 30, end: 100, code: 2 },
    ]);
    expect(spans.map((span) => span.share)).toEqual([0.3, 0.7]);
  });

  it("shares the width when no time passed", () => {
    const spans = spansOf([
      { start: 5, end: 5, code: 1 },
      { start: 5, end: 5, code: 2 },
    ]);
    expect(spans.map((span) => span.share)).toEqual([0.5, 0.5]);
  });

  it("has no spans without runs", () => {
    expect(spansOf([])).toEqual([]);
  });
});

describe("stateSlot", () => {
  it("cycles codes through the five chart slots, negatives too", () => {
    expect([0, 1, 4, 5, 9, -1, -7].map(stateSlot)).toEqual([1, 2, 5, 1, 5, 5, 4]);
  });
});

describe("resetsDaily", () => {
  it("holds for a counter declared daily, only", () => {
    const running: Metric = { key: "energy_total", kind: "counter", exponent: -2 };
    expect([counter, gauge, running].map(resetsDaily)).toEqual([true, false, false]);
  });
});
