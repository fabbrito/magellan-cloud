import { describe, expect, it } from "vitest";

import { batchSchema, manifestSchema } from "./schema.ts";

const gauge = { key: "power_w", kind: "gauge", unit: "W" };

const threeKinds = {
  sources: [
    {
      id: "source_1",
      metrics: [
        gauge,
        { key: "energy_kwh", kind: "counter", unit: "kWh" },
        { key: "mode", kind: "state", state_labels: { "0": "idle", "1": "running" } },
      ],
    },
  ],
};

const batch = {
  manifest_hash: "0".repeat(64),
  seq: "1",
  readings: [{ source: "source_1", ts: 1_758_326_400_000, values: { power_w: 1234.5 } }],
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

  it("rejects a measured metric without a unit", () => {
    const missing = { sources: [{ id: "source_1", metrics: [{ key: "power_w", kind: "gauge" }] }] };
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

  it("rejects a key past the length bound", () => {
    const long = { sources: [{ id: "source_1", metrics: [{ ...gauge, key: "m".repeat(65) }] }] };
    expect(manifestSchema.safeParse(long).success).toBe(false);
  });

  it("rejects an unknown property", () => {
    const extra = { sources: [{ id: "source_1", metrics: [{ ...gauge, scale: 1 }] }] };
    expect(manifestSchema.safeParse(extra).success).toBe(false);
  });
});

describe("batchSchema", () => {
  it("accepts a minimal batch", () => {
    expect(batchSchema.safeParse(batch).success).toBe(true);
  });

  it("accepts a heartbeat", () => {
    const withHeartbeat = {
      ...batch,
      seq: "2",
      heartbeat: {
        boot_id: "a1b2c3d4",
        uptime_seconds: 3600,
        buffer_depth: 0,
        battery_percent: 88,
        signal: 70,
        firmware_version: "1.0.0",
      },
    };
    expect(batchSchema.safeParse(withHeartbeat).success).toBe(true);
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
        { source: "source_2", ts: 1_758_326_460_000, values: { temperature_c: -12.5 } },
      ],
    };
    expect(batchSchema.safeParse(two).success).toBe(true);
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
    const upper = {
      ...batch,
      heartbeat: { boot_id: "A1B2C3D4", uptime_seconds: 1, buffer_depth: 0 },
    };
    expect(batchSchema.safeParse(upper).success).toBe(false);
  });
});
