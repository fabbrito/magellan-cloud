import { manifestHash } from "@magellan/contract";
import { mintToken } from "@magellan/shared";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { manifest, manifestBytes } from "./fixtures.ts";
import { registerDevice, startIngest } from "./harness.ts";

let server: TestHarness;

beforeAll(async () => {
  server = await startIngest();
});

afterAll(async () => {
  await server.close();
});

it("refuses a manifest carrying no token", async () => {
  const response = await server.fetch("/v1/devices/inverter/manifest", {
    method: "PUT",
    body: JSON.stringify(manifest),
  });

  expect(response.status).toBe(401);
});

it("accepts a manifest from the device its token names", async () => {
  const token = await registerDevice(server, "pump");

  const response = await server.fetch("/v1/devices/pump/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });

  expect(response.status).toBe(200);
});

it("refuses a token that resolves to no device", async () => {
  const response = await server.fetch("/v1/devices/pump/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${await mintToken()}`, "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });

  expect(response.status).toBe(401);
});

it("refuses a path id the token does not name", async () => {
  const token = await registerDevice(server, "meter");

  const response = await server.fetch("/v1/devices/pump/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });

  expect(response.status).toBe(403);
});

it("answers with the hash of the bytes it received", async () => {
  const token = await registerDevice(server, "chiller");
  const response = await server.fetch("/v1/devices/chiller/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: manifestBytes,
  });

  expect(response.headers.get("etag")).toBe(`"${await manifestHash(manifestBytes)}"`);
});

it("refuses a manifest the contract does not accept", async () => {
  const token = await registerDevice(server, "compressor");

  const response = await server.fetch("/v1/devices/compressor/manifest", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ sources: [] }),
  });

  expect(response.status).toBe(400);
});
