import type { Db } from "@magellan/db";
import { instantOf } from "@magellan/http";
import { asc, eq, sql } from "drizzle-orm";

import type { Registration, TokenRow } from "./api.ts";
import { tables, type TokenKind } from "./kind.ts";
import { hashToken, mintToken } from "./token.ts";

// The registry as the admin worker writes it: bound queries, where token-cli prints SQL text.

// Revoked rows too: what was once let in stays listed.
export async function listTokens(db: Db, kind: TokenKind): Promise<TokenRow[]> {
  const table = tables[kind];
  const rows = await db.select().from(table).orderBy(asc(table.id));
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    created_at: instantOf(row.createdAt),
    revoked_at: row.revokedAt === null ? null : instantOf(row.revokedAt),
  }));
}

// The token, returned once and stored only as its hash; undefined when the id is taken, revoked
// ones included — a revoked id never comes back to name another holder.
export async function registerToken(
  db: Db,
  kind: TokenKind,
  registration: Registration,
  nowMs: number,
): Promise<string | undefined> {
  const table = tables[kind];
  const token = mintToken();
  const rows = await db
    .insert(table)
    .values({ ...registration, tokenHash: await hashToken(token), createdAt: nowMs })
    .onConflictDoNothing({ target: table.id })
    .returning({ id: table.id });
  return rows.length === 1 ? token : undefined;
}

// One write, so a revoke racing another keeps the first instant. False for an id never registered;
// revoking one already revoked is true and changes nothing.
export async function revokeToken(
  db: Db,
  kind: TokenKind,
  id: string,
  nowMs: number,
): Promise<boolean> {
  const table = tables[kind];
  const rows = await db
    .update(table)
    .set({ revokedAt: sql`coalesce(${table.revokedAt}, ${nowMs})` })
    .where(eq(table.id, id))
    .returning({ id: table.id });
  return rows.length === 1;
}
