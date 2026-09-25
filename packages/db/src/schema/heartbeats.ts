import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The batch receipt, and what gap detection reads (docs/adr/0003-dedup-is-the-readings-own-key.md).
// `seq` is text: u64::MAX is past an exact JS number. It sorts lexicographically, not numerically.
// The index serves the device list's last-seen read, which would otherwise scan a device's history.
export const heartbeats = sqliteTable(
  "heartbeats",
  {
    deviceId: text("device_id").notNull(),
    bootId: text("boot_id").notNull(),
    seq: text("seq").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    uptimeSeconds: integer("uptime_seconds").notNull(),
    bufferDepth: integer("buffer_depth").notNull(),
    batteryPercent: integer("battery_percent"),
    signalPercent: integer("signal_percent"),
    firmwareVersion: text("firmware_version"),
    receivedAt: integer("received_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.bootId, table.seq] }),
    index("heartbeats_device_id_received_at").on(table.deviceId, table.receivedAt),
  ],
);
