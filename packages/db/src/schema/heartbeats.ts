import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The device's account of itself, history kept so a client can chart battery and signal. Live
// state, never archived, so not rebuildable from R2
// (docs/adr/0007-the-heartbeat-is-apart-from-data.md). The key's descending walk serves health's
// latest heartbeat. Two in one millisecond keep the first. `sources_last_heard` is JSON, keyed by
// source id, as the heartbeat carried it.
export const heartbeats = sqliteTable(
  "heartbeats",
  {
    deviceId: text("device_id").notNull(),
    receivedAt: integer("received_at").notNull(),
    bootId: text("boot_id").notNull(),
    uptimeSeconds: integer("uptime_seconds").notNull(),
    bufferDepth: integer("buffer_depth").notNull(),
    batteryPercent: integer("battery_percent"),
    signalPercent: integer("signal_percent"),
    firmwareVersion: text("firmware_version"),
    sourcesLastHeard: text("sources_last_heard", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.receivedAt] })],
);

export type NewHeartbeat = typeof heartbeats.$inferInsert;
