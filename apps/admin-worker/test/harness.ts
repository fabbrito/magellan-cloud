import { hashToken, mintToken } from "@magellan/token";
import { createTestHarness, type TestHarness } from "wrangler";

// The admin worker beside the API worker, one D1 between them, so a minted client token is proved
// by reading with it. The admin worker is first, so a relative path reaches it.
export async function startCloud(adminTokenHash: string): Promise<TestHarness> {
  const server = createTestHarness({
    workers: [
      {
        configPath: new URL("../wrangler.jsonc", import.meta.url),
        secrets: { ADMIN_TOKEN_HASH: adminTokenHash },
      },
      { configPath: new URL("../../api-worker/wrangler.jsonc", import.meta.url) },
    ],
  });
  await server.listen();
  await server.getWorker<Env>().applyD1Migrations("DB");
  return server;
}

// A fresh admin token and the hash the deploy would ship for it.
export async function adminToken(): Promise<{ token: string; hash: string }> {
  const token = mintToken();
  return { token, hash: await hashToken(token) };
}

// A request as the maintainer's infra repository makes it: `token` undefined sends none.
export function call(
  server: TestHarness,
  token: string | undefined,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> =
    token === undefined ? {} : { authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return server.fetch(path, { method: init.method ?? "GET", headers, body });
}

export function readApi(server: TestHarness, token: string, path: string) {
  const api = server.getWorker("magellan-api");
  return api.fetch(`http://api${path}`, { headers: { authorization: `Bearer ${token}` } });
}
