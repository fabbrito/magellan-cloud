import type { Batch } from "@magellan/contract";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import {
  archiveOf,
  declareManifest,
  postBatch,
  query,
  registerDevice,
  startIngest,
} from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

function batchOf(manifestHash: string, seq: string): Batch {
  return {
    manifest_hash: manifestHash,
    boot_id: "0123456789abcdef",
    seq,
    readings: [{ source: "inlet", ts: 1_767_225_600_000, values: { temperature: 213 } }],
    heartbeat: { uptime_seconds: 42, buffer_depth: 0 },
  };
}

it("accepts a batch under a manifest the device declared", async () => {
  const token = await registerDevice(server, "device-01");
  const manifestHash = await declareManifest(server, "device-01", token);

  const response = await postBatch(server, "device-01", token, batchOf(manifestHash, "0"));

  expect(response.status).toBe(204);
});

it("refuses a batch under a manifest it never received", async () => {
  const token = await registerDevice(server, "device-02");
  const undeclared = "0".repeat(64);

  const response = await postBatch(server, "device-02", token, batchOf(undeclared, "0"));

  // 5xx, not 4xx: the manifest may still arrive, so the device keeps the buffer
  // (docs/DESIGN.md §6).
  expect(response.status).toBe(503);
});

it("archives the bytes it received, one object per batch", async () => {
  const token = await registerDevice(server, "device-03");
  const manifestHash = await declareManifest(server, "device-03", token);
  const batch = batchOf(manifestHash, "3");

  await postBatch(server, "device-03", token, batch);
  await postBatch(server, "device-03", token, batch);

  // A retry overwrites the identical object: the key is the batch's identity, so the archive is
  // idempotent (docs/adr/0003-dedup-is-the-readings-own-key.md).
  const archived = await archiveOf(server, "device-03/batches/");
  expect(archived).toEqual([
    { key: expect.stringContaining("device-03/batches/"), body: JSON.stringify(batch) },
  ]);
});

it("commits a row per reading and the batch receipt", async () => {
  const token = await registerDevice(server, "device-04");
  const manifestHash = await declareManifest(server, "device-04", token);

  await postBatch(server, "device-04", token, batchOf(manifestHash, "9"));

  expect(
    await query(
      server,
      "SELECT source, ts, manifest_hash, `values` FROM readings WHERE device_id = ?",
      "device-04",
    ),
  ).toEqual([
    {
      source: "inlet",
      ts: 1_767_225_600_000,
      manifest_hash: manifestHash,
      values: '{"temperature":213}',
    },
  ]);
  expect(
    await query(
      server,
      "SELECT boot_id, seq, manifest_hash, uptime_seconds FROM heartbeats WHERE device_id = ?",
      "device-04",
    ),
  ).toEqual([
    { boot_id: "0123456789abcdef", seq: "9", manifest_hash: manifestHash, uptime_seconds: 42 },
  ]);
});

it("archives a batch whose manifest never arrived", async () => {
  const token = await registerDevice(server, "device-05");
  const undeclared = "0".repeat(64);

  await postBatch(server, "device-05", token, batchOf(undeclared, "0"));

  // The 503 is only half the contract: the archive is what rebuilds D1 once the manifest lands.
  expect(await archiveOf(server, "device-05/batches/")).toHaveLength(1);
});

it("absorbs a replayed batch", async () => {
  const token = await registerDevice(server, "device-06");
  const manifestHash = await declareManifest(server, "device-06", token);
  const batch = batchOf(manifestHash, "1");

  await postBatch(server, "device-06", token, batch);
  const replay = await postBatch(server, "device-06", token, batch);

  expect(replay.status).toBe(204);
  expect(await query(server, "SELECT ts FROM readings WHERE device_id = ?", "device-06")).toEqual([
    { ts: 1_767_225_600_000 },
  ]);
});

it("refuses a reading the manifest does not declare", async () => {
  const token = await registerDevice(server, "device-07");
  const manifestHash = await declareManifest(server, "device-07", token);
  const batch = batchOf(manifestHash, "0");
  batch.readings = [{ source: "outlet", ts: 1_767_225_600_000, values: { temperature: 1 } }];

  const response = await postBatch(server, "device-07", token, batch);

  // 4xx: the cloud never widens a registry by being sent one, so the retry cannot succeed.
  expect(response.status).toBe(422);
});

it("refuses a batch carrying no token", async () => {
  const response = await server.fetch("/v1/devices/inverter/batches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batchOf("0".repeat(64), "0")),
  });

  expect(response.status).toBe(401);
});
