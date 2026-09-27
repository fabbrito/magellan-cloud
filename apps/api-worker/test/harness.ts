import type { Manifest } from "@magellan/contract";
import { SimulatedDevice } from "@magellan/simulator";
import { mintStatement, revokeStatement, type TokenKind } from "@magellan/token";
import { createTestHarness, type TestHarness } from "wrangler";

// Ingest beside the API worker, one D1 between them: readings arrive as a device sends them,
// never as rows a test wrote, so the API reads what ingest actually commits. The API worker is
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

// Registers a token through the statement tools/token prints; the token exists only here.
async function register(server: TestHarness, kind: TokenKind, id: string): Promise<string> {
  const minted = await mintStatement(kind, id, `${kind} ${id}`, Date.now());
  if (!minted.ok) throw new Error(minted.problem);
  const env = await server.getWorker<Env>().getEnv();
  await env.DB.prepare(minted.statement).run();
  return minted.token;
}

export function registerDevice(server: TestHarness, deviceId: string): Promise<string> {
  return register(server, "device", deviceId);
}

export function registerClient(server: TestHarness, clientId: string): Promise<string> {
  return register(server, "client", clientId);
}

export async function revokeClient(server: TestHarness, clientId: string): Promise<void> {
  const revoked = revokeStatement("client", clientId, Date.now());
  if (!revoked.ok) throw new Error(revoked.problem);
  const env = await server.getWorker<Env>().getEnv();
  await env.DB.prepare(revoked.statement).run();
}

// A read as a client makes it: `token` undefined sends none.
export function read(server: TestHarness, token: string | undefined, path: string, method = "GET") {
  const headers: Record<string, string> =
    token === undefined ? {} : { authorization: `Bearer ${token}` };
  return server.fetch(path, { method, headers });
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
export async function getJson<Body>(
  server: TestHarness,
  token: string,
  path: string,
): Promise<Body> {
  const response = await read(server, token, path);
  if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as Body;
}
