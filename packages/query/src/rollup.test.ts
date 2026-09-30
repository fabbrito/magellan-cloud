import type { Metric } from "@magellan/contract";
import { describe, expect, it } from "vitest";

import { hourMs } from "./bucket.ts";
import { bucketPoints, readingPoints, type BucketGroup } from "./rollup.ts";
import type { Sample } from "./series.ts";

// What D1 aggregates is tested against D1, in apps/api-worker/test/api.test.ts. This is the merge
// the Worker does after it: a bucket's groups, one a manifest, into one point.

const firstTs = Date.UTC(2026, 0, 1);
const quarterMs = hourMs / 4;

const gauge: Metric = { key: "power", kind: "gauge", unit: "W", exponent: -1 };
const state: Metric = { key: "mode", kind: "state" };
const counter: Metric = { key: "energy", kind: "counter", exponent: 0 };

const samplesOf = (values: number[], exponent: number): Sample[] =>
  values.map((value, index) => ({ ts: firstTs + index * quarterMs, exponent, value }));

const group = (fields: Partial<BucketGroup>): BucketGroup => ({
  start: firstTs,
  exponent: 0,
  total: 0,
  count: 1,
  lastTs: firstTs,
  last: 0,
  ...fields,
});

describe("by reading", () => {
  it("scales each reading", () => {
    expect(readingPoints(samplesOf([215, 220], -1))).toEqual([
      { ts: firstTs, value: 21.5 },
      { ts: firstTs + quarterMs, value: 22 },
    ]);
  });

  it("answers a counter's raw value each reading, a reset included", () => {
    expect(readingPoints(samplesOf([10, 15, 3], 0)).map((point) => point.value)).toEqual([
      10, 15, 3,
    ]);
  });
});

describe("by bucket", () => {
  it("averages a gauge over its bucket", () => {
    expect(bucketPoints(gauge, [group({ exponent: -1, total: 100, count: 4 })])).toEqual([
      { ts: firstTs, value: 2.5 },
    ]);
  });

  it("weighs each reading once across a re-scale mid-bucket, by its own exponent", () => {
    // Three readings of 2.0 at exponent -1, one of 6.00 at exponent -2.
    const groups = [
      group({ exponent: -1, total: 60, count: 3 }),
      group({ exponent: -2, total: 600, count: 1 }),
    ];

    expect(bucketPoints(gauge, groups)).toEqual([{ ts: firstTs, value: 3 }]);
  });

  it("keeps the value last by time across a re-declare mid-bucket", () => {
    const groups = [
      group({ exponent: 0, lastTs: firstTs + 3 * quarterMs, last: 7 }),
      group({ exponent: -1, lastTs: firstTs + quarterMs, last: 900 }),
    ];

    expect(bucketPoints(counter, groups)).toEqual([{ ts: firstTs, value: 7 }]);
  });

  it("keeps a state's last code unscaled", () => {
    expect(bucketPoints(state, [group({ last: 3 })])).toEqual([{ ts: firstTs, value: 3 }]);
  });

  it("answers a point a bucket, in order", () => {
    const groups = [group({ last: 1 }), group({ start: firstTs + hourMs, last: 2 })];

    expect(bucketPoints(counter, groups)).toEqual([
      { ts: firstTs, value: 1 },
      { ts: firstTs + hourMs, value: 2 },
    ]);
  });

  it("has no bucket without readings", () => {
    expect(bucketPoints(gauge, [])).toEqual([]);
  });
});
