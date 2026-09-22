import { describe, expect, it } from "vitest";

import { checkBatchAgainstManifest } from "./check.ts";
import { manifestSchema } from "./schema.ts";

const manifest = manifestSchema.parse({
  sources: [
    {
      id: "source_1",
      metrics: [
        { key: "power_w", kind: "gauge", unit: "W", exponent: -2 },
        { key: "energy_kwh", kind: "counter", unit: "kWh", exponent: 0 },
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
  manifest_hash: "d935aec39b4c492681d137f322ce5876ce1509289a3d5d759cd0b85fbf11790a",
  boot_id: "0123456789abcdef",
  seq: "1",
  readings,
  heartbeat: { uptime_seconds: 42, buffer_depth: 1 },
});

describe("checkBatchAgainstManifest", () => {
  it("accepts values that match the declared metrics", () => {
    const check = checkBatchAgainstManifest(
      manifest,
      batch([reading("source_1", { power_w: 123_450, energy_kwh: 42, mode: 1 })]),
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
});
