import type { Batch } from "@magellan/contract";
import { hashToken, mintToken } from "@magellan/shared";
import { createTestHarness, type TestHarness } from "wrangler";

import { manifestBytes } from "./fixtures.ts";

// One server per test file: booting workerd costs seconds, and `reset()` recreates storage and
// moves the URL. Tests stay apart by taking a device id each.
export async function startIngest(): Promise<TestHarness> {
  const server = createTestHarness({
    workers: [{ configPath: new URL("../wrangler.jsonc", import.meta.url) }],
  });
  await server.listen();
  await server.getWorker<Env>().applyD1Migrations("DB");
  return server;
}

// Registers a device as tools/mint-token does; the token exists only here.
export async function registerDevice(server: TestHarness, id: string): Promise<string> {
  const token = await mintToken();
  const env = await server.getWorker<Env>().getEnv();
  await env.DB.prepare(
    "INSERT INTO devices (id, description, token_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, `device ${id}`, await hashToken(token), Date.now())
    .run();
  return token;
}

// Declares a manifest through the route, returning the hash the cloud accepted.
export async function declareManifest(
  server: TestHarness,
  deviceId: string,
  token: string,
): Promise<string> {
  const response = await server.fetch(`/v1/devices/${deviceId}/manifest`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: manifestBytes,
  });
  if (response.status !== 200)
    throw new Error(`declaring the manifest answered ${response.status}`);
  return (response.headers.get("etag") ?? "").replaceAll('"', "");
}

// The return type is wrangler's Response, not the runtime's — left inferred rather than named.
export function postBatch(server: TestHarness, deviceId: string, token: string, batch: Batch) {
  return server.fetch(`/v1/devices/${deviceId}/batches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(batch),
  });
}

// D1 and R2 get a wire reader at the query rung; until then a durable write has no observer but the
// binding. Anything HTTP can show is asserted over HTTP instead.
export async function archiveOf(
  server: TestHarness,
  deviceId: string,
): Promise<{ key: string; body: string | undefined }[]> {
  const env = await server.getWorker<Env>().getEnv();
  const listed = await env.ARCHIVE.list({ prefix: `${deviceId}/` });

  return Promise.all(
    listed.objects.map(async (object) => {
      const stored = await env.ARCHIVE.get(object.key);
      return { key: object.key, body: await stored?.text() };
    }),
  );
}

export async function query<Row>(
  server: TestHarness,
  sql: string,
  ...binds: string[]
): Promise<Row[]> {
  const env = await server.getWorker<Env>().getEnv();
  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Row>();
  return results;
}
