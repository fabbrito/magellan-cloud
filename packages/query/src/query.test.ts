import { describe, expect, it } from "vitest";

import { dayMs } from "./bucket.ts";
import { refName, rollupOf, seriesQuerySchema, windowOf } from "./query.ts";

const nowMs = 1_790_270_481_000;
const metric = "source_1:power";

describe("window", () => {
  it("takes the last day when neither bound is given", () => {
    const query = seriesQuerySchema.parse({ metric });

    expect(windowOf(query, nowMs)).toEqual({ fromMs: nowMs - dayMs, toMs: nowMs });
  });

  it("keeps both bounds when both are given", () => {
    const query = seriesQuerySchema.parse({ metric, from: "1000", to: "2000" });

    expect(windowOf(query, nowMs)).toEqual({ fromMs: 1000, toMs: 2000 });
  });

  it("reads a bound given as RFC 3339", () => {
    const query = seriesQuerySchema.parse({
      metric,
      from: "2026-09-29T00:00:00.000Z",
      to: "2026-09-29T03:00:00-03:00",
    });

    expect(windowOf(query, nowMs)).toEqual({
      fromMs: Date.UTC(2026, 8, 29),
      toMs: Date.UTC(2026, 8, 29, 6),
    });
  });

  it.each([{ from: "1000" }, { to: "2000" }])("refuses one bound alone: %o", (bounds) => {
    expect(seriesQuerySchema.safeParse({ metric, ...bounds }).success).toBe(false);
  });
});

describe("metric", () => {
  it("splits a list of source:key", () => {
    const query = seriesQuerySchema.parse({ metric: "source_1:power,source_2:energy.today" });

    expect(query.metric).toEqual([
      { source: "source_1", key: "power" },
      { source: "source_2", key: "energy.today" },
    ]);
  });

  it("names a metric in the form it parses from", () => {
    const query = seriesQuerySchema.parse({ metric: "source_2:energy.today" });

    expect(query.metric.map(refName)).toEqual(["source_2:energy.today"]);
  });

  it.each(["", "power", "source_1:power:extra", "source_1:power,source_1:power", "a b:power"])(
    "refuses %j",
    (value) => {
      expect(seriesQuerySchema.safeParse({ metric: value }).success).toBe(false);
    },
  );

  it("refuses more metrics than one read answers", () => {
    const many = Array.from({ length: 21 }, (_unused, index) => `source_1:m${index}`).join(",");

    expect(seriesQuerySchema.safeParse({ metric: many }).success).toBe(false);
  });
});

const rollupFor = (spanMs: number) => {
  const query = seriesQuerySchema.parse({ metric, from: "0", to: String(spanMs) });
  return rollupOf(query, windowOf(query, nowMs));
};

describe("rollup", () => {
  it.each([
    [2 * dayMs, "reading"],
    [2 * dayMs + 1, "hour"],
    [90 * dayMs, "hour"],
    [90 * dayMs + 1, "day"],
  ])("defaults a %d ms range to %s", (spanMs, rollup) => {
    expect(rollupFor(spanMs)).toBe(rollup);
  });

  it("keeps the rollup asked for", () => {
    const query = seriesQuerySchema.parse({ metric, from: "0", to: "1", rollup: "day" });

    expect(rollupOf(query, windowOf(query, nowMs))).toBe("day");
  });
});
