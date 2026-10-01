import type { Batch, Heartbeat } from "@magellan/contract";
import { describe, expect, it } from "vitest";

import { chunk, heartbeatRowOf, readingRowsOf, receiptRowOf } from "./commit.ts";

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

  it.each([0, -1, 0.5])("throws on a size of %d, which never ends", (size) => {
    expect(() => chunk([1], size)).toThrow("never ends");
  });
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

it("stores a heartbeat as received, its left-out fields as null", () => {
  const heartbeat: Heartbeat = {
    boot_id: "0123456789abcdef",
    uptime_seconds: 3600,
    buffer_depth: 2,
    sources_last_heard: { inlet: 1 },
  };

  expect(heartbeatRowOf("device-01", heartbeat, receivedAt)).toEqual({
    deviceId: "device-01",
    receivedAt: 1_767_225_600_000,
    bootId: "0123456789abcdef",
    uptimeSeconds: 3600,
    bufferDepth: 2,
    batteryPercent: null,
    signalPercent: null,
    firmwareVersion: null,
    sourcesLastHeard: { inlet: 1 },
  });
});

it("stores the optional fields a heartbeat carries", () => {
  const heartbeat: Heartbeat = {
    boot_id: "0123456789abcdef",
    uptime_seconds: 3600,
    buffer_depth: 2,
    battery_percent: 88,
    signal_percent: 61,
    firmware_version: "1.2.3",
    sources_last_heard: {},
  };

  expect(heartbeatRowOf("device-01", heartbeat, receivedAt)).toMatchObject({
    batteryPercent: 88,
    signalPercent: 61,
    firmwareVersion: "1.2.3",
  });
});
