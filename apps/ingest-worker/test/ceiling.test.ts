import { LIMITS } from "@magellan/contract";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { fullBatchReadings, widestManifestBytes } from "./fixtures.ts";
import { postBatch, query, registerDevice, startIngest } from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

// The contract's largest legal batch, which is what pins the insert chunk size: SQLite's variable
// cap is the real bound and D1 publishes none, so the ceiling is asserted rather than looked up.
it("commits a batch at every bound the contract allows", async () => {
  const token = await registerDevice(server, "inverter");
  const declared = await server.fetch("/v1/devices/inverter/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: widestManifestBytes,
  });
  const manifestHash = (declared.headers.get("etag") ?? "").replaceAll('"', "");

  const response = await postBatch(server, "inverter", token, {
    manifest_hash: manifestHash,
    boot_id: "0123456789abcdef",
    seq: "0",
    readings: fullBatchReadings(1_767_225_600_000),
    heartbeat: { uptime_seconds: 42, buffer_depth: 0 },
  });

  expect(response.status).toBe(204);
  expect(
    await query(server, "SELECT count(*) AS rows FROM readings WHERE device_id = ?", "inverter"),
  ).toEqual([{ rows: LIMITS.readingsPerBatchMax }]);
});

it("refuses a body past the byte bound", async () => {
  const token = await registerDevice(server, "pump");

  const response = await server.fetch("/v1/devices/pump/batches", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    // A sized body, so the request carries the content-length the guard reads.
    body: new Uint8Array(LIMITS.batchBytesMax + 1).fill(120),
  });

  // Refused on its declared length, before the body is read and parsed: a bound turns a spike into
  // a refusal instead of a timeout (docs/STYLE.md).
  expect(response.status).toBe(413);
});
