import { LIMITS, manifestHash } from "@magellan/contract";
import { mintToken } from "@magellan/token";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { manifest, manifestBytes } from "./fixtures.ts";
import {
  acceptedHash,
  archiveOf,
  declareManifest,
  putManifest,
  registerDevice,
  revokeDevice,
  startIngest,
} from "./harness.ts";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

it("refuses a manifest carrying no token", async () => {
  const response = await putManifest(server, "device-01", undefined, encode(manifest));

  expect(response.status).toBe(401);
});

it("accepts a manifest from the device its token names", async () => {
  const token = await registerDevice(server, "device-02");

  const response = await putManifest(server, "device-02", token, encode(manifest));

  expect(response.status).toBe(200);
});

it("refuses a token that resolves to no device", async () => {
  const response = await putManifest(server, "device-02", mintToken(), encode(manifest));

  expect(response.status).toBe(401);
});

it("refuses a revoked token", async () => {
  const token = await registerDevice(server, "device-revoked");
  await revokeDevice(server, "device-revoked");

  const response = await putManifest(server, "device-revoked", token, encode(manifest));

  expect(response.status).toBe(401);
});

it("refuses a path id the token does not name", async () => {
  const token = await registerDevice(server, "device-03");

  const response = await putManifest(server, "device-02", token, encode(manifest));

  expect(response.status).toBe(403);
});

it("answers with the hash of the bytes it received", async () => {
  const token = await registerDevice(server, "device-04");

  const response = await putManifest(server, "device-04", token, manifestBytes);

  expect(acceptedHash(response)).toBe(await manifestHash(manifestBytes));
});

// Regression: the validator's default answered its whole parse result as the body. The reason is
// warned to the maintainer's logs; the device, which never branches on it, gets the status alone.
it("refuses a manifest the contract does not accept, with an empty body", async () => {
  const token = await registerDevice(server, "device-05");

  const response = await putManifest(
    server,
    "device-05",
    token,
    encode({ tz: "UTC", sources: [] }),
  );

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("");
});

it("refuses a manifest that declares no length", async () => {
  const token = await registerDevice(server, "device-06");

  // Not through `putManifest`: the omission is the subject.
  const response = await server.fetch("/v1/devices/device-06/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: manifestBytes,
  });

  expect(response.status).toBe(411);
});

it("refuses a manifest past the byte bound without reading it", async () => {
  const token = await registerDevice(server, "device-07");

  // A real body past the bound, not a forged length: the client refuses to send a length that
  // disagrees with what it writes, so the only honest way to reach 413 is to be too big.
  const response = await putManifest(
    server,
    "device-07",
    token,
    new Uint8Array(LIMITS.manifestBytesMax + 1).fill(120),
  );

  expect(response.status).toBe(413);
});

it("archives the manifest under the hash it accepted", async () => {
  const token = await registerDevice(server, "device-08");

  const hash = await declareManifest(server, "device-08", token);

  // D1's manifests table is a derived index; without this object it is the only copy, and every
  // archived batch naming it becomes unrebuildable (docs/DESIGN.md invariant 7).
  expect(await archiveOf(server, "device-08/manifests/")).toEqual([
    { key: `device-08/manifests/${hash}`, body: new TextDecoder().decode(manifestBytes) },
  ]);
});
