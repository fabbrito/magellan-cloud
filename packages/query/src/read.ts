import { manifestSchema } from "@magellan/contract";
import { devices, heartbeats, manifests, readings, type Db } from "@magellan/db";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { Heartbeat } from "./api.ts";
import type { Declaration } from "./metric.ts";

// Row reads, left unawaited so a caller batches the independent ones into one round trip. Every read
// here is bounded where it runs: the limit a caller trusts is the one in the query.
export const devicesMax = 100;
// A day of heartbeats is ~300 at a five-minute sweep; this leaves room for a device catching up.
export const receiptsMax = 2000;

// Throws on a row ingest wrote and this cannot read: a bug here, never the caller's.
export function declarationOf(row: {
  hash: string;
  declaredAt: number;
  body: string;
}): Declaration {
  return {
    hash: row.hash,
    declaredAt: row.declaredAt,
    manifest: manifestSchema.parse(JSON.parse(row.body)),
  };
}

export function heartbeatOf(row: typeof heartbeats.$inferSelect): Heartbeat {
  return {
    boot_id: row.bootId,
    seq: row.seq,
    uptime_seconds: row.uptimeSeconds,
    buffer_depth: row.bufferDepth,
    battery_percent: row.batteryPercent,
    signal_percent: row.signalPercent,
    firmware_version: row.firmwareVersion,
    received_at: row.receivedAt,
  };
}

// A correlated MAX per device rides the (device_id, received_at) index rather than a join over
// every heartbeat.
export function selectDevices(db: Db) {
  return db
    .select({
      id: devices.id,
      description: devices.description,
      lastSeen: sql<
        number | null
      >`(SELECT MAX(${heartbeats.receivedAt}) FROM ${heartbeats} WHERE ${heartbeats.deviceId} = ${devices.id})`,
    })
    .from(devices)
    .orderBy(asc(devices.id))
    .limit(devicesMax);
}

export function selectDevice(db: Db, deviceId: string) {
  return db
    .select({ id: devices.id, description: devices.description })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
}

// Current is the latest declared: a device sends its manifest on boot and on every change.
export function selectCurrentManifest(db: Db, deviceId: string) {
  return db
    .select({ hash: manifests.hash, declaredAt: manifests.declaredAt, body: manifests.body })
    .from(manifests)
    .where(eq(manifests.deviceId, deviceId))
    .orderBy(desc(manifests.declaredAt))
    .limit(1);
}

export async function manifestsOf(
  db: Db,
  deviceId: string,
  hashes: string[],
): Promise<Declaration[]> {
  if (hashes.length === 0) return [];
  const rows = await db
    .select({ hash: manifests.hash, declaredAt: manifests.declaredAt, body: manifests.body })
    .from(manifests)
    .where(and(eq(manifests.deviceId, deviceId), inArray(manifests.hash, hashes)));
  return rows.map(declarationOf);
}

export function selectLatestHeartbeat(db: Db, deviceId: string) {
  return db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.deviceId, deviceId))
    .orderBy(desc(heartbeats.receivedAt))
    .limit(1);
}

export function selectReceipts(db: Db, deviceId: string, sinceMs: number) {
  return db
    .select({ bootId: heartbeats.bootId, seq: heartbeats.seq })
    .from(heartbeats)
    .where(and(eq(heartbeats.deviceId, deviceId), gte(heartbeats.receivedAt, sinceMs)))
    .limit(receiptsMax);
}

export interface SampleQuery {
  deviceId: string;
  source: string;
  key: string;
  fromMs: number;
  toMs: number;
}

// One metric out of each reading's JSON. The key pattern admits `.`, so the path quotes it; it
// admits no `"`, so the quoting cannot be broken out of.
export function selectSamples(db: Db, query: SampleQuery, limit: number) {
  const value = sql<number | null>`json_extract(${readings.values}, ${`$."${query.key}"`})`;
  return db
    .select({ ts: readings.ts, manifestHash: readings.manifestHash, value })
    .from(readings)
    .where(
      and(
        eq(readings.deviceId, query.deviceId),
        eq(readings.source, query.source),
        gte(readings.ts, query.fromMs),
        lt(readings.ts, query.toMs),
        sql`${value} IS NOT NULL`,
      ),
    )
    .orderBy(asc(readings.ts))
    .limit(limit);
}
