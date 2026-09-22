import { describe, expect, it } from "vitest";

import { batchSchema, manifestSchema } from "./schema.ts";

const gauge = { key: "power_w", kind: "gauge", unit: "W", exponent: -2 };

const threeKinds = {
  sources: [
    {
      id: "source_1",
      metrics: [
        gauge,
        { key: "energy_kwh", kind: "counter", unit: "kWh", exponent: 0 },
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
  heartbeat: { uptime_seconds: 42, buffer_depth: 0 },
};

describe("manifestSchema", () => {
  it("accepts one source with one gauge", () => {
    expect(
      manifestSchema.safeParse({ sources: [{ id: "source_1", metrics: [gauge] }] }).success,
    ).toBe(true);
  });

  it("accepts all three metric kinds", () => {
    expect(manifestSchema.safeParse(threeKinds).success).toBe(true);
  });

  it("rejects an empty source list", () => {
    expect(manifestSchema.safeParse({ sources: [] }).success).toBe(false);
  });

  it("rejects a source with no metrics", () => {
    expect(manifestSchema.safeParse({ sources: [{ id: "source_1", metrics: [] }] }).success).toBe(
      false,
    );
  });

  it("accepts a measured metric without a unit", () => {
    const missing = {
      sources: [{ id: "source_1", metrics: [{ key: "power_w", kind: "gauge", exponent: 0 }] }],
    };
    expect(manifestSchema.safeParse(missing).success).toBe(true);
  });

  it("rejects a measured metric without an exponent", () => {
    const missing = {
      sources: [{ id: "source_1", metrics: [{ key: "power_w", kind: "gauge", unit: "W" }] }],
    };
    expect(manifestSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects a unit on a state", () => {
    const state = {
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state", unit: "x" }] }],
    };
    expect(manifestSchema.safeParse(state).success).toBe(false);
  });

  it("rejects state labels on a gauge", () => {
    const labelled = {
      sources: [{ id: "source_1", metrics: [{ ...gauge, state_labels: { "0": "off" } }] }],
    };
    expect(manifestSchema.safeParse(labelled).success).toBe(false);
  });

  it("rejects a non-decimal state code", () => {
    const bad = {
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
    const dup = { sources: [{ id: "source_1", metrics: [gauge, gauge] }] };
    expect(manifestSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects a duplicate source id", () => {
    const dup = {
      sources: [
        { id: "source_1", metrics: [gauge] },
        { id: "source_1", metrics: [gauge] },
      ],
    };
    expect(manifestSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects an exponent past the bound", () => {
    const wide = { sources: [{ id: "source_1", metrics: [{ ...gauge, exponent: 13 }] }] };
    expect(manifestSchema.safeParse(wide).success).toBe(false);
  });

  it("rejects an exponent on a state", () => {
    const scaled = {
      sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state", exponent: 0 }] }],
    };
    expect(manifestSchema.safeParse(scaled).success).toBe(false);
  });

  it("rejects a key past the length bound", () => {
    const long = { sources: [{ id: "source_1", metrics: [{ ...gauge, key: "m".repeat(65) }] }] };
    expect(manifestSchema.safeParse(long).success).toBe(false);
  });

  it("rejects an unknown property", () => {
    const extra = { sources: [{ id: "source_1", metrics: [{ ...gauge, factor: 0.01 }] }] };
    expect(manifestSchema.safeParse(extra).success).toBe(false);
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
      heartbeat: { uptime_seconds: 42, buffer_depth: 1 },
    };
    expect(batchSchema.safeParse(wire).success).toBe(true);
  });

  it("accepts a heartbeat", () => {
    const withHeartbeat = {
      ...batch,
      seq: "2",
      heartbeat: {
        uptime_seconds: 3600,
        buffer_depth: 0,
        battery_percent: 88,
        signal_percent: 70,
        firmware_version: "1.0.0",
      },
    };
    expect(batchSchema.safeParse(withHeartbeat).success).toBe(true);
  });

  it("rejects a batch with no boot id", () => {
    const { boot_id: _bootId, ...withoutBootId } = batch;
    expect(batchSchema.safeParse(withoutBootId).success).toBe(false);
  });

  it("rejects a boot id inside a heartbeat", () => {
    const stale = {
      ...batch,
      heartbeat: { ...batch.heartbeat, boot_id: "0123456789abcdef" },
    };
    expect(batchSchema.safeParse(stale).success).toBe(false);
  });

  it("rejects a batch with no heartbeat", () => {
    const { heartbeat: _heartbeat, ...withoutHeartbeat } = batch;
    expect(batchSchema.safeParse(withoutHeartbeat).success).toBe(false);
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
