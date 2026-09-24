import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Presentation: the one D1 table the archive cannot rebuild (docs/DESIGN.md §2). Names keys, never
// their meaning (docs/adr/0005-the-device-owns-meaning.md).
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
