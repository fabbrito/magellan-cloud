import { describe, expect, it } from "vitest";

import { checkBatchAgainstManifest } from "./check.ts";
import { manifestSchema } from "./schema.ts";

const manifest = manifestSchema.parse({
  sources: [
    {
      id: "source_1",
      metrics: [
        { key: "power_w", kind: "gauge", unit: "W" },
        { key: "energy_kwh", kind: "counter", unit: "kWh" },
        { key: "mode", kind: "state", state_labels: { "0": "idle", "1": "running" } },
      ],
    },
  ],
});

const reading = (source: string, values: Record<string, number>) => ({
  source,
  ts: 1,
  values,
});

const batch = (readings: ReturnType<typeof reading>[]) => ({
  manifest_hash: "dc803b6bdf3e71bdc6633908d93792832731b960e5559a403e58c275e96fdaef",
  seq: "1",
  readings,
});

describe("checkBatchAgainstManifest", () => {
  it("accepts values that match the declared metrics", () => {
    const check = checkBatchAgainstManifest(
      manifest,
      batch([reading("source_1", { power_w: 1234.5, energy_kwh: 42, mode: 1 })]),
    );
    expect(check).toEqual({ ok: true });
  });

  it("refuses a source the manifest does not declare", () => {
    const check = checkBatchAgainstManifest(manifest, batch([reading("source_9", { power_w: 1 })]));
    expect(check).toMatchObject({ ok: false, reason: "source_unknown", source: "source_9" });
  });

  it("refuses a metric the source does not declare", () => {
    const check = checkBatchAgainstManifest(
      manifest,
      batch([reading("source_1", { power_w: 1, voltage_v: 2 })]),
    );
    expect(check).toMatchObject({ ok: false, reason: "metric_unknown", metric: "voltage_v" });
  });

  it("refuses a fractional counter", () => {
    const check = checkBatchAgainstManifest(
      manifest,
      batch([reading("source_1", { energy_kwh: 1.5 })]),
    );
    expect(check).toMatchObject({ ok: false, reason: "counter_not_integer", metric: "energy_kwh" });
  });

  it("refuses a fractional state", () => {
    const check = checkBatchAgainstManifest(manifest, batch([reading("source_1", { mode: 0.5 })]));
    expect(check).toMatchObject({ ok: false, reason: "state_not_integer", metric: "mode" });
  });
});
