import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Only the hash is stored (docs/adr/0004-the-token-is-the-authority.md).
// `description` is required: an id alone names nothing a person would recognize in a dashboard.
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});
