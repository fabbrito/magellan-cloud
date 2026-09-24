import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Presentation, written by the query worker: the one D1 table the archive cannot rebuild
// (docs/DESIGN.md §2). `body` is JSON cards naming metric keys, never what the keys mean — that is
// read from the manifest (docs/adr/0005-the-device-owns-meaning.md).
export const layouts = sqliteTable(
  "layouts",
  {
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.name] })],
);
