import { LIMITS } from "@magellan/contract";
import { largestManifest } from "@magellan/simulator";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { fullBatchReadings, widestManifestBytes } from "./fixtures.ts";
import {
  acceptedHash,
  postBatch,
  putManifest,
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

// The contract's largest legal batch, which is what pins the insert chunk size: SQLite's variable
// cap is the real bound and D1 publishes none, so the ceiling is asserted rather than looked up.
it("commits a batch at every bound the contract allows", async () => {
  const token = await registerDevice(server, "device-01");
  const declared = await putManifest(server, "device-01", token, widestManifestBytes);
  const manifestHash = acceptedHash(declared);

  const response = await postBatch(server, "device-01", token, {
    manifest_hash: manifestHash,
    boot_id: "0123456789abcdef",
    seq: "0",
    readings: fullBatchReadings(1_767_225_600_000),
  });

  expect(response.status).toBe(204);
  expect(
    await query(server, "SELECT count(*) AS rows FROM readings WHERE device_id = ?", "device-01"),
  ).toEqual([{ rows: LIMITS.readingsPerBatchMax }]);
});

// D1 refuses a value past 2 MB, and a deterministic refusal answered 5xx is retried forever.
it("stores the largest manifest the contract allows", async () => {
  const token = await registerDevice(server, "device-03");
  const body = new TextEncoder().encode(JSON.stringify(largestManifest));

  expect((await putManifest(server, "device-03", token, body)).status).toBe(200);
});

it("refuses a body past the byte bound", async () => {
  const token = await registerDevice(server, "device-02");
  const body = new Uint8Array(LIMITS.batchBytesMax + 1).fill(120);

  const response = await server.fetch("/v1/devices/device-02/batches", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-length": String(body.byteLength),
    },
    body,
  });

  // Refused on its declared length, before the body is read and parsed: a bound turns a spike into
  // a refusal instead of a timeout (docs/STYLE.md).
  expect(response.status).toBe(413);
});
