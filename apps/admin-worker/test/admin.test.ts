import type { TokenRow } from "@magellan/token";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestHarness } from "wrangler";

import { adminToken, call, readApi, startCloud } from "./harness.ts";

let server: TestHarness;
let admin: string;

beforeAll(async () => {
  const minted = await adminToken();
  admin = minted.token;
  server = await startCloud(minted.hash);
});

afterAll(async () => {
  await server.close();
});

const register = (collection: string, id: string, description = `${id} here`) =>
  call(server, admin, `/v1/${collection}`, { method: "POST", body: { id, description } });

const revoke = (collection: string, id: string) =>
  call(server, admin, `/v1/${collection}/${id}/revoke`, { method: "POST" });

async function tokenOf(collection: string, id: string): Promise<string> {
  const response = await register(collection, id);
  if (response.status !== 201) throw new Error(`${id} answered ${response.status}`);
  const { token } = (await response.json()) as { token: string };
  return token;
}

async function rowOf(collection: string, id: string): Promise<TokenRow | undefined> {
  const response = await call(server, admin, `/v1/${collection}`);
  const rows = (await response.json()) as TokenRow[];
  return rows.find((row) => row.id === id);
}

describe("the admin token", () => {
  it("is asked for, and nothing is told without it", async () => {
    const response = await call(server, undefined, "/v1/devices");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("is the only token let in: a client token is not", async () => {
    const client = await tokenOf("clients", "not-an-admin");

    expect((await call(server, client, "/v1/devices")).status).toBe(401);
  });

  it("is checked before the body is read", async () => {
    const response = await call(server, undefined, "/v1/devices", {
      method: "POST",
      body: { id: "Bad Id" },
    });

    expect(response.status).toBe(401);
  });
});

describe("registering", () => {
  it("answers the token once, uncached", async () => {
    const response = await register("devices", "shop-floor-01");

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ id: "shop-floor-01" });
  });

  it("mints a client token the read API takes", async () => {
    const token = await tokenOf("clients", "grafana");

    expect((await readApi(server, token, "/v1/devices")).status).toBe(200);
  });

  it("refuses a taken id", async () => {
    await tokenOf("devices", "taken");

    expect((await register("devices", "taken")).status).toBe(409);
  });

  it("refuses a revoked id: it never names another holder", async () => {
    await tokenOf("devices", "gone");
    await revoke("devices", "gone");

    expect((await register("devices", "gone")).status).toBe(409);
  });

  it("keeps the kinds apart: a device id is free as a client id", async () => {
    await tokenOf("devices", "both");

    expect((await register("clients", "both")).status).toBe(201);
  });

  it.each([
    ["Bad Id", "described"],
    ["fine", "it's quoted"],
    ["fine", ""],
  ])("refuses id %o with description %o", async (id, description) => {
    expect((await register("devices", id, description)).status).toBe(400);
  });

  it("refuses a body past its bound", async () => {
    const response = await register("devices", "large", "a".repeat(2048));

    expect(response.status).toBe(413);
  });
});

describe("revoking", () => {
  it("shuts the read API to the client", async () => {
    const token = await tokenOf("clients", "retired");

    expect((await revoke("clients", "retired")).status).toBe(204);
    expect((await readApi(server, token, "/v1/devices")).status).toBe(401);
  });

  it("keeps the first instant when repeated", async () => {
    await tokenOf("devices", "twice");
    await revoke("devices", "twice");
    const first = await rowOf("devices", "twice");

    expect((await revoke("devices", "twice")).status).toBe(204);
    expect(first?.revoked_at).not.toBeNull();
    expect(await rowOf("devices", "twice")).toEqual(first);
  });

  it("refuses an id never registered", async () => {
    expect((await revoke("devices", "never")).status).toBe(404);
  });
});

describe("listing", () => {
  it("lists each kind in its own collection, revoked ones too", async () => {
    await tokenOf("devices", "listed");
    await revoke("devices", "listed");

    expect(await rowOf("devices", "listed")).toMatchObject({ description: "listed here" });
    expect(await rowOf("clients", "listed")).toBeUndefined();
  });
});
