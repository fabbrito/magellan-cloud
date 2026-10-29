import { apiClients, devices } from "@magellan/db";

// A token's kind names the table that holds it, so a device token never reads and a client token
// never ingests: each resolves only in its own table. The one place a kind becomes a table.
export const tables = { device: devices, client: apiClients } as const;

export type TokenKind = keyof typeof tables;

export function isTokenKind(word: string | undefined): word is TokenKind {
  return word !== undefined && Object.hasOwn(tables, word);
}
