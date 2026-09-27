import { apiClients, devices, type Db } from "@magellan/db";
import { and, eq, getTableName, isNull } from "drizzle-orm";

import { bearerToken, hashToken, idPattern, mintToken } from "./token.ts";

// A token's kind names the table that holds it, so a device token never reads and a client token
// never ingests: each resolves only in its own table. The one place a kind becomes a table.
const tables = { device: devices, client: apiClients } as const;

export type TokenKind = keyof typeof tables;

export function isTokenKind(word: string | undefined): word is TokenKind {
  return word !== undefined && Object.hasOwn(tables, word);
}

// The id a header's token names, or undefined for no token, an unknown one, a revoked one, or one of
// another kind. Which of those it was is not the caller's to learn.
export async function resolveToken(
  db: Db,
  kind: TokenKind,
  header: string | undefined,
): Promise<string | undefined> {
  const token = bearerToken(header);
  if (token === undefined) return undefined;

  const table = tables[kind];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tokenHash, await hashToken(token)), isNull(table.revokedAt)))
    .limit(1);
  return row?.id;
}

// The statements are SQL text, not bound queries: `wrangler d1 execute --command` takes nothing
// else. Id and description reach a string literal unescaped, so the patterns are what make that safe
// — quotes and backslashes are out rather than escaped.
export type Refusal = { ok: false; problem: string };
export type Statement = { ok: true; statement: string } | Refusal;
export type Minted = { ok: true; statement: string; token: string } | Refusal;

const descriptionLengthMax = 64;
const descriptionPattern = new RegExp(`^[A-Za-z0-9 ._:()/-]{1,${descriptionLengthMax}}$`);

const idProblem = "An id is lowercase letters, digits and dashes, starting with a letter or digit.";
const descriptionProblem = `A description is 1 to ${descriptionLengthMax} characters, no quotes or backslashes.`;

// The token is returned once and never stored: the statement carries only its hash.
export async function mintStatement(
  kind: TokenKind,
  id: string,
  description: string,
  nowMs: number,
): Promise<Minted> {
  if (!idPattern.test(id)) return { ok: false, problem: idProblem };
  if (!descriptionPattern.test(description)) return { ok: false, problem: descriptionProblem };

  const table = tables[kind];
  const token = mintToken();
  const statement =
    `INSERT INTO ${getTableName(table)} ` +
    `(${table.id.name}, ${table.description.name}, ${table.tokenHash.name}, ${table.createdAt.name}) ` +
    `VALUES ('${id}', '${description}', '${await hashToken(token)}', ${nowMs})`;
  return { ok: true, statement, token };
}

// Revoked, never deleted: the row keeps what the token wrote or read attributed.
export function revokeStatement(kind: TokenKind, id: string, nowMs: number): Statement {
  if (!idPattern.test(id)) return { ok: false, problem: idProblem };

  const table = tables[kind];
  const statement =
    `UPDATE ${getTableName(table)} SET ${table.revokedAt.name} = ${nowMs} ` +
    `WHERE ${table.id.name} = '${id}' AND ${table.revokedAt.name} IS NULL`;
  return { ok: true, statement };
}
