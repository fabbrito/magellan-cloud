import type { Metric } from "@magellan/query/api";
import { describe, expect, it } from "vitest";

import { formatAge, formatValue, stateLabel } from "./format.ts";

describe("formatValue", () => {
  it("shows the digits the exponent was sent with, and the unit", () => {
    const metric: Metric = { key: "energy", kind: "counter", unit: "kWh", exponent: -2 };
    expect(formatValue(3.5, metric)).toMatch(/^3[.,]50 kWh$/);
  });

  it("shows no fraction for a non-negative exponent, nor a unit it lacks", () => {
    const metric: Metric = { key: "count", kind: "gauge", exponent: 1 };
    expect(formatValue(40, metric)).toBe("40");
  });
});

describe("stateLabel", () => {
  const metric: Metric = { key: "mode", kind: "state", state_labels: { "2": "fault" } };

  it("names a labelled code", () => {
    expect(stateLabel(metric, 2)).toBe("fault");
  });

  it("falls back to the code", () => {
    expect(stateLabel(metric, 7)).toBe("7");
  });
});

describe("formatAge", () => {
  const nowMs = 10 * 24 * 60 * 60 * 1000;

  it("buckets by the largest whole unit", () => {
    expect(formatAge(nowMs - 30 * 1000, nowMs)).toBe("just now");
    expect(formatAge(nowMs - 5 * 60 * 1000, nowMs)).toBe("5 min ago");
    expect(formatAge(nowMs - 3 * 60 * 60 * 1000, nowMs)).toBe("3 h ago");
    expect(formatAge(nowMs - 2 * 24 * 60 * 60 * 1000, nowMs)).toBe("2 d ago");
  });

  it("reads a clock ahead of the browser as now", () => {
    expect(formatAge(nowMs + 60 * 1000, nowMs)).toBe("just now");
  });
});
