import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The key is the dedup: a replayed batch collides row for row and vanishes
// (docs/adr/0003-dedup-is-the-readings-own-key.md). JSON values so a manifest costs no migration.
// `manifest_hash` is the one the reading was read under, so a re-scaled metric charts each value by
// its own exponent rather than the current one.
export const readings = sqliteTable(
  "readings",
  {
    deviceId: text("device_id").notNull(),
    source: text("source").notNull(),
    ts: integer("ts").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    values: text("values", { mode: "json" }).$type<Record<string, number>>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.source, table.ts] })],
);

export type NewReading = typeof readings.$inferInsert;
