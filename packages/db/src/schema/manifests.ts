import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// `body` is the exact bytes received: the hash is over those, and a re-serialized copy would hash
// differently (docs/DESIGN.md §6). Keyed by device too — identical sensors declare identical bytes.
export const manifests = sqliteTable(
  "manifests",
  {
    deviceId: text("device_id").notNull(),
    hash: text("hash").notNull(),
    body: text("body").notNull(),
    declaredAt: integer("declared_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.hash] })],
);
