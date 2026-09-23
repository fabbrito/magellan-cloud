import {
  LIMITS,
  batchSchema,
  checkBatchAgainstManifest,
  manifestSchema,
  type Batch,
} from "@magellan/contract";
import { expect, it } from "vitest";

import { ceilingReadings, gaugeManifest, largestManifest } from "./ceiling.ts";

const firstTs = Date.UTC(2026, 0, 1);

it("declares the largest manifest the contract accepts", () => {
  const metrics = largestManifest.sources.flatMap((source) => source.metrics);
  const labelCounts = metrics.map((metric) =>
    metric.kind === "state" ? Object.keys(metric.state_labels ?? {}).length : 0,
  );

  expect(manifestSchema.safeParse(largestManifest).success).toBe(true);
  expect(largestManifest.sources).toHaveLength(LIMITS.sourcesMax);
  expect(metrics).toHaveLength(LIMITS.sourcesMax * LIMITS.metricsPerSourceMax);
  expect(new Set(labelCounts)).toEqual(new Set([LIMITS.stateLabelsMax]));
});

it("fills the largest batch the contract accepts", () => {
  const batch: Batch = {
    manifest_hash: "0".repeat(LIMITS.manifestHashHexLength),
    boot_id: "0123456789abcdef",
    seq: "0",
    readings: ceilingReadings(firstTs),
    heartbeat: { uptime_seconds: 0, buffer_depth: LIMITS.readingsPerBatchMax },
  };
  const valueCounts = batch.readings.map((reading) => Object.keys(reading.values).length);

  expect(manifestSchema.safeParse(gaugeManifest).success).toBe(true);
  expect(batchSchema.safeParse(batch).success).toBe(true);
  expect(checkBatchAgainstManifest(gaugeManifest, batch)).toEqual({ ok: true });
  expect(batch.readings).toHaveLength(LIMITS.readingsPerBatchMax);
  expect(new Set(valueCounts)).toEqual(new Set([LIMITS.metricsPerSourceMax]));
});
