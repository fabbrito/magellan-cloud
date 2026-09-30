import { index, primaryKey, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// The batch receipt, and what gap detection reads (docs/adr/0003-dedup-is-the-readings-own-key.md).
// `seq` is text: u64::MAX is past an exact JS number. It sorts lexicographically, not numerically.
// The index serves health's window of receipts and latest receipt, which would otherwise scan a
// device's history.
export const batches = sqliteTable(
  "batches",
  {
    deviceId: text("device_id").notNull(),
    bootId: text("boot_id").notNull(),
    seq: text("seq").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.bootId, table.seq] }),
    index("batches_device_id_received_at").on(table.deviceId, table.receivedAt),
  ],
);
