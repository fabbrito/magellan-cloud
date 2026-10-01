import type { Batch, Heartbeat } from "@magellan/contract";
import { describe, expect, it } from "vitest";

import {
  chunk,
  heartbeatRowOf,
  readingRowsOf,
  readingsPerInsertMax,
  receiptRowOf,
} from "./commit.ts";

const batch: Batch = {
  manifest_hash: "abc",
  boot_id: "0123456789abcdef",
  seq: "7",
  readings: [
    { source: "inlet", ts: 1, values: { temperature: 213 } },
    { source: "outlet", ts: 2, values: { temperature: 198 } },
  ],
};

const receivedAt = new Date(1_767_225_600_000);

describe("chunk", () => {
  it("splits rows into runs of at most the size, in order", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("answers no runs for no rows", () => {
    expect(chunk([], 2)).toEqual([]);
  });
});

// D1 binds one parameter a column, 100 a statement. A column added to readings without the bound
// following it fails here rather than at the ceiling in production.
it("keeps an insert of readings under D1's bound parameters", () => {
  const [row] = readingRowsOf("device-01", batch);
  if (row === undefined) throw new Error("no row");

  expect(readingsPerInsertMax * Object.keys(row).length).toBeLessThanOrEqual(100);
});

it("files every reading under the batch's manifest", () => {
  expect(readingRowsOf("device-01", batch)).toEqual([
    {
      deviceId: "device-01",
      source: "inlet",
      ts: 1,
      manifestHash: "abc",
      values: { temperature: 213 },
    },
    {
      deviceId: "device-01",
      source: "outlet",
      ts: 2,
      manifestHash: "abc",
      values: { temperature: 198 },
    },
  ]);
});

it("receipts a batch by its boot, seq and manifest, at the time received", () => {
  expect(receiptRowOf("device-01", batch, receivedAt)).toEqual({
    deviceId: "device-01",
    bootId: "0123456789abcdef",
    seq: "7",
    manifestHash: "abc",
    receivedAt: 1_767_225_600_000,
  });
});

it("stores a heartbeat's left-out fields as null", () => {
  const heartbeat: Heartbeat = {
    boot_id: "0123456789abcdef",
    uptime_seconds: 3600,
    buffer_depth: 2,
    sources_last_heard: { inlet: 1 },
  };

  expect(heartbeatRowOf("device-01", heartbeat, receivedAt)).toMatchObject({
    batteryPercent: null,
    signalPercent: null,
    firmwareVersion: null,
  });
});
