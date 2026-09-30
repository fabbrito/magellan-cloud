import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits.ts";
import { batchSchema, heartbeatSchema, manifestSchema } from "./schema.ts";

const gauge = { key: "power_w", kind: "gauge", unit: "W", exponent: -2 };
const counter = { key: "energy_kwh", kind: "counter", unit: "kWh", exponent: 0 };

const threeKinds = {
  tz: "UTC",
  sources: [
    {
      id: "source_1",
      metrics: [
        gauge,
        counter,
        { key: "mode", kind: "state", state_labels: { "0": "idle", "1": "running" } },
      ],
    },
  ],
};

const batch = {
  manifest_hash: "0".repeat(64),
  boot_id: "0123456789abcdef",
  seq: "1",
  readings: [{ source: "source_1", ts: 1_758_326_400_000, values: { power_w: 123_450 } }],
};

const heartbeat = {
  boot_id: "0123456789abcdef",
  uptime_seconds: 42,
  buffer_depth: 0,
  sources_last_heard: {},
};

describe("manifestSchema", () => {
  it("accepts one source with one gauge", () => {
    expect(
      manifestSchema.safeParse({ tz: "UTC", sources: [{ id: "source_1", metrics: [gauge] }] })
        .success,
    ).toBe(true);
  });

  it("accepts all three metric kinds", () => {
    expect(manifestSchema.safeParse(threeKinds).success).toBe(true);
  });

  it("rejects an empty source list", () => {
    expect(manifestSchema.safeParse({ tz: "UTC", sources: [] }).success).toBe(false);
  });

  it("rejects a source with no metrics", () => {
    expect(
      manifestSchema.safeParse({ tz: "UTC", sources: [{ id: "source_1", metrics: [] }] }).success,
    ).toBe(false);
  });

  it("accepts a measured metric without a unit", () => {
    const missing = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "power_w", kind: "gauge", exponent: 0 }] }],
    };
    expect(manifestSchema.safeParse(missing).success).toBe(true);
  });

  it("rejects a measured metric without an exponent", () => {
    const missing = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "power_w", kind: "gauge", unit: "W" }] }],
    };
    expect(manifestSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects a unit on a state", () => {
    const state = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state", unit: "x" }] }],
    };
    expect(manifestSchema.safeParse(state).success).toBe(false);
  });

  it("rejects state labels on a gauge", () => {
    const labelled = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, state_labels: { "0": "off" } }] }],
    };
    expect(manifestSchema.safeParse(labelled).success).toBe(false);
  });

  it("rejects a non-decimal state code", () => {
    const bad = {
      tz: "UTC",
      sources: [
        {
          id: "source_1",
          metrics: [{ key: "mode", kind: "state", state_labels: { idle: "off" } }],
        },
      ],
    };
    expect(manifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a duplicate metric key within a source", () => {
    const dup = { tz: "UTC", sources: [{ id: "source_1", metrics: [gauge, gauge] }] };
    expect(manifestSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects a duplicate source id", () => {
    const dup = {
      tz: "UTC",
      sources: [
        { id: "source_1", metrics: [gauge] },
        { id: "source_1", metrics: [gauge] },
      ],
    };
    expect(manifestSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects an exponent past the bound", () => {
    const wide = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, exponent: 13 }] }],
    };
    expect(manifestSchema.safeParse(wide).success).toBe(false);
  });

  it("rejects an exponent on a state", () => {
    const scaled = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state", exponent: 0 }] }],
    };
    expect(manifestSchema.safeParse(scaled).success).toBe(false);
  });

  it("rejects a key a URL path would need to escape", () => {
    const colon = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, key: "power:w" }] }],
    };
    expect(manifestSchema.safeParse(colon).success).toBe(false);
  });

  it("accepts a key of URL-unreserved characters", () => {
    const dotted = {
      tz: "UTC",
      sources: [{ id: "source-1", metrics: [{ ...gauge, key: "power.w_1" }] }],
    };
    expect(manifestSchema.safeParse(dotted).success).toBe(true);
  });

  it("rejects a key past the length bound", () => {
    const long = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, key: "m".repeat(65) }] }],
    };
    expect(manifestSchema.safeParse(long).success).toBe(false);
  });

  it("accepts a counter that resets daily", () => {
    const daily = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...counter, resets: "daily" }] }],
    };
    expect(manifestSchema.safeParse(daily).success).toBe(true);
  });

  it("rejects a cadence past the enum", () => {
    const weekly = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...counter, resets: "weekly" }] }],
    };
    expect(manifestSchema.safeParse(weekly).success).toBe(false);
  });

  it("rejects resets on a gauge", () => {
    const resetting = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, resets: "daily" }] }],
    };
    expect(manifestSchema.safeParse(resetting).success).toBe(false);
  });

  it("rejects resets on a state", () => {
    const resetting = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state", resets: "daily" }] }],
    };
    expect(manifestSchema.safeParse(resetting).success).toBe(false);
  });

  it("rejects an unknown property", () => {
    const extra = {
      tz: "UTC",
      sources: [{ id: "source_1", metrics: [{ ...gauge, factor: 0.01 }] }],
    };
    expect(manifestSchema.safeParse(extra).success).toBe(false);
  });
});

const withTz = (tz: unknown) => ({ ...threeKinds, tz });

describe("manifestSchema tz", () => {
  it.each(["America/Sao_Paulo", "UTC", "Etc/GMT+3", "America/Argentina/Buenos_Aires"])(
    "accepts %o",
    (tz) => {
      expect(manifestSchema.safeParse(withTz(tz)).success).toBe(true);
    },
  );

  it("requires a zone", () => {
    const { tz: _dropped, ...zoneless } = threeKinds;

    expect(manifestSchema.safeParse(zoneless).success).toBe(false);
  });

  it.each([
    ["+03:00", "is an offset, not a zone"],
    ["America/Sao Paulo", "has a space"],
    ["Mars/Olympus_Mons", "names no zone"],
    ["", "is empty"],
    [`America/${"x".repeat(64)}`, "is past the bound"],
  ])("refuses %o, which %s", (tz) => {
    expect(manifestSchema.safeParse(withTz(tz)).success).toBe(false);
  });
});

describe("batchSchema", () => {
  it("accepts a minimal batch", () => {
    expect(batchSchema.safeParse(batch).success).toBe(true);
  });

  it("accepts the device's wire shape", () => {
    // The bytes `magellan-device` parses; both halves must accept this.
    const wire = {
      manifest_hash: "d935aec39b4c492681d137f322ce5876ce1509289a3d5d759cd0b85fbf11790a",
      boot_id: "0123456789abcdef",
      seq: "1",
      readings: [{ source: "source_1", ts: 1_758_326_400_000, values: { power_w: 27_034 } }],
    };
    expect(batchSchema.safeParse(wire).success).toBe(true);
  });

  it("rejects a batch with no boot id", () => {
    const { boot_id: _bootId, ...withoutBootId } = batch;
    expect(batchSchema.safeParse(withoutBootId).success).toBe(false);
  });

  it("rejects a heartbeat inside a batch", () => {
    expect(batchSchema.safeParse({ ...batch, heartbeat }).success).toBe(false);
  });

  it("accepts the largest seq", () => {
    expect(batchSchema.safeParse({ ...batch, seq: "18446744073709551615" }).success).toBe(true);
  });

  it("accepts two readings", () => {
    const two = {
      ...batch,
      seq: "3",
      readings: [
        { source: "source_1", ts: 1_758_326_400_000, values: { power_w: 1 } },
        { source: "source_2", ts: 1_758_326_460_000, values: { temperature_c: -125 } },
      ],
    };
    expect(batchSchema.safeParse(two).success).toBe(true);
  });

  it("rejects a fractional metric value", () => {
    const fractional = {
      ...batch,
      readings: [{ source: "source_1", ts: 1, values: { power_w: 1234.5 } }],
    };
    expect(batchSchema.safeParse(fractional).success).toBe(false);
  });

  it("rejects a metric value past the exact-integer bound", () => {
    const wide = {
      ...batch,
      readings: [{ source: "source_1", ts: 1, values: { power_w: 9_007_199_254_740_992 } }],
    };
    expect(batchSchema.safeParse(wide).success).toBe(false);
  });

  it("accepts a negative metric value", () => {
    const below = {
      ...batch,
      readings: [{ source: "source_1", ts: 1, values: { temperature_c: -125 } }],
    };
    expect(batchSchema.safeParse(below).success).toBe(true);
  });

  it("rejects a seq past u64::MAX", () => {
    expect(batchSchema.safeParse({ ...batch, seq: "18446744073709551616" }).success).toBe(false);
  });

  it("rejects a seq with a leading zero", () => {
    expect(batchSchema.safeParse({ ...batch, seq: "01" }).success).toBe(false);
  });

  it("rejects a seq that is not a string", () => {
    expect(batchSchema.safeParse({ ...batch, seq: 1 }).success).toBe(false);
  });

  it("rejects a seq past the digit bound", () => {
    expect(batchSchema.safeParse({ ...batch, seq: "1".repeat(21) }).success).toBe(false);
  });

  it("rejects a short manifest hash", () => {
    expect(batchSchema.safeParse({ ...batch, manifest_hash: "0".repeat(63) }).success).toBe(false);
  });

  it("rejects a reading with no values", () => {
    const empty = { ...batch, readings: [{ source: "source_1", ts: 1, values: {} }] };
    expect(batchSchema.safeParse(empty).success).toBe(false);
  });

  it("rejects a batch with no readings", () => {
    expect(batchSchema.safeParse({ ...batch, readings: [] }).success).toBe(false);
  });

  it("rejects a negative timestamp", () => {
    const negative = {
      ...batch,
      readings: [{ source: "source_1", ts: -1, values: { power_w: 1 } }],
    };
    expect(batchSchema.safeParse(negative).success).toBe(false);
  });

  it("rejects an unknown property", () => {
    expect(batchSchema.safeParse({ ...batch, device: "x" }).success).toBe(false);
  });

  it("rejects an uppercase boot id", () => {
    expect(batchSchema.safeParse({ ...batch, boot_id: "A1B2C3D4" }).success).toBe(false);
  });
});

describe("heartbeatSchema", () => {
  it("accepts a minimal heartbeat, no source heard yet", () => {
    expect(heartbeatSchema.safeParse(heartbeat).success).toBe(true);
  });

  it("accepts every field", () => {
    const full = {
      ...heartbeat,
      battery_percent: 88,
      signal_percent: 70,
      firmware_version: "1.0.0",
      sources_last_heard: { source_1: 1_758_326_400_000, "source.2": 0 },
    };
    expect(heartbeatSchema.safeParse(full).success).toBe(true);
  });

  it("rejects a heartbeat with no boot id", () => {
    const { boot_id: _bootId, ...withoutBootId } = heartbeat;
    expect(heartbeatSchema.safeParse(withoutBootId).success).toBe(false);
  });

  it("rejects a heartbeat with no sources_last_heard", () => {
    const { sources_last_heard: _heard, ...withoutHeard } = heartbeat;
    expect(heartbeatSchema.safeParse(withoutHeard).success).toBe(false);
  });

  it("rejects a source id off the key pattern", () => {
    const bad = { ...heartbeat, sources_last_heard: { ".hidden": 1 } };
    expect(heartbeatSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a last-heard past the timestamp bound", () => {
    const late = { ...heartbeat, sources_last_heard: { source_1: LIMITS.timestampMsMax + 1 } };
    expect(heartbeatSchema.safeParse(late).success).toBe(false);
  });

  it("rejects more sources than a manifest may declare", () => {
    const heard = Object.fromEntries(
      Array.from({ length: LIMITS.sourcesMax + 1 }, (_unused, index) => [`source_${index}`, 1]),
    );
    const crowded = { ...heartbeat, sources_last_heard: heard };
    expect(heartbeatSchema.safeParse(crowded).success).toBe(false);
  });
});
