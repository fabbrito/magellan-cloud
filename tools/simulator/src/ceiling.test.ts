import {
  LIMITS,
  batchSchema,
  checkBatchAgainstManifest,
  manifestSchema,
  type Batch,
} from "@magellan/contract";
import { expect, it } from "vitest";

import { ceilingReadings, gaugeManifest, largestManifest } from "./ceiling.ts";

// Every body here is ASCII, so its length is its size in bytes.
const byteLength = (value: unknown) => JSON.stringify(value).length;

it("declares the largest manifest the contract accepts", () => {
  expect(manifestSchema.safeParse(largestManifest).success).toBe(true);
  expect(byteLength(largestManifest)).toBeGreaterThan(LIMITS.manifestBytesMax * 0.9);
});

it("fills the largest batch the contract accepts", () => {
  const batch: Batch = {
    manifest_hash: "0".repeat(LIMITS.manifestHashHexLength),
    boot_id: "0123456789abcdef",
    seq: "0",
    readings: ceilingReadings(1_767_225_600_000),
    heartbeat: { uptime_seconds: 0, buffer_depth: LIMITS.readingsPerBatchMax },
  };

  expect(manifestSchema.safeParse(gaugeManifest).success).toBe(true);
  expect(batchSchema.safeParse(batch).success).toBe(true);
  expect(checkBatchAgainstManifest(gaugeManifest, batch)).toEqual({ ok: true });
  expect(byteLength(batch)).toBeGreaterThan(LIMITS.batchBytesMax * 0.85);
});
