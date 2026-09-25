import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A reader of the read API — a Grafana, a script. Its own table, so a device token never reads and
// a client token never ingests. Only the hash is stored; revoked, never deleted, so what was once
// let in stays on record.
export const apiClients = sqliteTable("api_clients", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
});
