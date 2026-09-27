import { describe, expect, it } from "vitest";

import { mintStatement, revokeStatement } from "./store.ts";
import { hashToken } from "./token.ts";

const nowMs = Date.UTC(2026, 0, 1);

// The statements are what the live store runs, so these read their text as SQL would.
describe("mintStatement", () => {
  it.each([
    ["device", "devices"],
    ["client", "api_clients"],
  ] as const)("writes a %s into %s", async (kind, table) => {
    const minted = await mintStatement(kind, "shop-floor-01", "Shop floor", nowMs);
    if (!minted.ok) throw new Error(minted.problem);

    expect(minted.statement).toMatch(new RegExp(`^INSERT INTO ${table} `));
  });

  it("stores the token's hash and never the token", async () => {
    const minted = await mintStatement("device", "shop-floor-01", "Shop floor", nowMs);
    if (!minted.ok) throw new Error(minted.problem);

    expect(minted.statement).toContain(`'${await hashToken(minted.token)}'`);
    expect(minted.statement).not.toContain(minted.token);
  });

  it.each([
    ["shop'floor", "Shop floor", "closes the id's literal"],
    ["shop-floor-01", "Shop's floor", "closes the description's literal"],
    ["shop-floor-01", "Shop \\ floor", "escapes past the description's literal"],
    ["shop-floor-01", "", "names nothing"],
    ["shop-floor-01", "a".repeat(65), "is past the column's bound"],
  ])("refuses id %o, description %o, which %s", async (id, description) => {
    expect((await mintStatement("device", id, description, nowMs)).ok).toBe(false);
  });
});

describe("revokeStatement", () => {
  it.each([
    ["device", "devices"],
    ["client", "api_clients"],
  ] as const)("revokes a %s in %s, once", (kind, table) => {
    const revoked = revokeStatement(kind, "shop-floor-01", nowMs);
    if (!revoked.ok) throw new Error(revoked.problem);

    expect(revoked.statement).toBe(
      `UPDATE ${table} SET revoked_at = ${nowMs} ` +
        `WHERE id = 'shop-floor-01' AND revoked_at IS NULL`,
    );
  });

  it("refuses an id that closes its literal", () => {
    expect(revokeStatement("client", "x' OR '1'='1", nowMs).ok).toBe(false);
  });
});
