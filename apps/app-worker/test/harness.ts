import type { Manifest } from "@magellan/contract";
import { hashToken, mintToken } from "@magellan/shared";
import { SimulatedDevice } from "@magellan/simulator";
import { createTestHarness, type TestHarness } from "wrangler";

// Ingest beside the app worker, one D1 between them: readings arrive as a device sends them,
// never as rows a test wrote, so the app reads what ingest actually commits. The app worker is
// first, so a relative path reaches it; the device reaches ingest by its own handle.
export async function startCloud(): Promise<TestHarness> {
  const server = createTestHarness({
    workers: [
      { configPath: new URL("../wrangler.jsonc", import.meta.url) },
      { configPath: new URL("../../ingest-worker/wrangler.jsonc", import.meta.url) },
    ],
  });
  await server.listen();
  await server.getWorker<Env>().applyD1Migrations("DB");
  return server;
}

// Registers a device as tools/mint-token does; the token exists only here.
export async function registerDevice(server: TestHarness, deviceId: string): Promise<string> {
  const token = await mintToken();
  const env = await server.getWorker<Env>().getEnv();
  await env.DB.prepare(
    "INSERT INTO devices (id, description, token_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(deviceId, `device ${deviceId}`, await hashToken(token), Date.now())
    .run();
  return token;
}

export interface Boot {
  deviceId: string;
  token: string;
  manifest: Manifest;
  bootId: string;
}

export function bootDevice(server: TestHarness, boot: Boot): SimulatedDevice {
  const ingest = server.getWorker("magellan-ingest");
  return new SimulatedDevice({
    ...boot,
    fetch: (path, init) => ingest.fetch(`http://ingest${path}`, init),
  });
}

// The cast is the test's claim about the body; the assertion that follows is what checks it.
export async function getJson<Body>(server: TestHarness, path: string): Promise<Body> {
  const response = await server.fetch(path);
  if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as Body;
}

export function putLayout(server: TestHarness, deviceId: string, name: string, body: unknown) {
  return server.fetch(`/api/v1/devices/${deviceId}/layouts/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
