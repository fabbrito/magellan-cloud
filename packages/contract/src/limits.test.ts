import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits.ts";

// The byte bounds must stay above what the other bounds permit, or the contract refuses a body it
// also declares legal. These build the largest body every other limit allows and weigh it, so
// raising a length, a count or a value without raising the byte bound fails here.
const pad = (prefix: string, index: number, length: number) =>
  `${prefix}${String(index).padStart(length - prefix.length, "0")}`;

const keys = Array.from({ length: LIMITS.metricsPerSourceMax }, (_unused, index) =>
  pad("k", index, LIMITS.keyLengthMax),
);

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

describe("the byte bounds hold the largest body the other bounds allow", () => {
  it("fits a manifest of fully labelled state metrics", () => {
    const stateLabels = Object.fromEntries(
      Array.from({ length: LIMITS.stateLabelsMax }, (_unused, index) => [
        String(index).padStart(LIMITS.stateCodeDigitsMax, "9"),
        "l".repeat(LIMITS.stateLabelLengthMax),
      ]),
    );
    const manifest = {
      sources: Array.from({ length: LIMITS.sourcesMax }, (_unused, index) => ({
        id: pad("s", index, LIMITS.keyLengthMax),
        metrics: keys.map((key) => ({ key, kind: "state", state_labels: stateLabels })),
      })),
    };

    expect(bytes(manifest)).toBeLessThanOrEqual(LIMITS.manifestBytesMax);
  });

  it("fits a full batch of maximal metric values", () => {
    const values = Object.fromEntries(keys.map((key) => [key, LIMITS.metricValueMax]));
    const batch = {
      manifest_hash: "0".repeat(LIMITS.manifestHashHexLength),
      boot_id: "f".repeat(LIMITS.bootIdLengthMax),
      seq: String(LIMITS.seqMax),
      readings: Array.from({ length: LIMITS.readingsPerBatchMax }, (_unused, index) => ({
        source: pad("s", 0, LIMITS.keyLengthMax),
        ts: LIMITS.timestampMsMax - index,
        values,
      })),
      heartbeat: {
        uptime_seconds: LIMITS.uptimeSecondsMax,
        buffer_depth: LIMITS.bufferDepthMax,
        battery_percent: LIMITS.batteryPercentMax,
        signal_percent: LIMITS.signalPercentMax,
        firmware_version: "v".repeat(LIMITS.firmwareVersionLengthMax),
      },
    };

    expect(bytes(batch)).toBeLessThanOrEqual(LIMITS.batchBytesMax);
  });
});
