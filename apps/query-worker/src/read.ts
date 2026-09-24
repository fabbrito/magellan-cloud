import { manifestSchema } from "@magellan/contract";
import { devices, heartbeats, layouts, manifests, readings, type Db } from "@magellan/db";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { Declaration } from "./metric.ts";

// Every read here is bounded where it runs: the limit a caller trusts is the one in the query.
export const devicesMax = 100;
export const layoutsPerDeviceMax = 16;
// A day of heartbeats is ~300 at a five-minute sweep; this leaves room for a device catching up.
export const receiptsMax = 2000;

// Throws on a row ingest wrote and this cannot read: a bug here, never the caller's.
function declarationOf(row: { hash: string; declaredAt: number; body: string }): Declaration {
  return {
    hash: row.hash,
    declaredAt: row.declaredAt,
    manifest: manifestSchema.parse(JSON.parse(row.body)),
  };
}

// A correlated MAX per device rides the (device_id, received_at) index rather than a join over
// every heartbeat.
export function listDevices(db: Db) {
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

export async function deviceOf(db: Db, deviceId: string) {
  const [device] = await db
    .select({ id: devices.id, description: devices.description })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);
  return device;
}

// Current is the latest declared: a device sends its manifest on boot and on every change.
export async function currentManifest(db: Db, deviceId: string): Promise<Declaration | undefined> {
  const [row] = await db
    .select({ hash: manifests.hash, declaredAt: manifests.declaredAt, body: manifests.body })
    .from(manifests)
    .where(eq(manifests.deviceId, deviceId))
    .orderBy(desc(manifests.declaredAt))
    .limit(1);
  return row === undefined ? undefined : declarationOf(row);
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

export async function latestHeartbeat(db: Db, deviceId: string) {
  const [heartbeat] = await db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.deviceId, deviceId))
    .orderBy(desc(heartbeats.receivedAt))
    .limit(1);
  return heartbeat;
}

export function receiptsSince(db: Db, deviceId: string, sinceMs: number) {
  return db
    .select({ bootId: heartbeats.bootId, seq: heartbeats.seq })
    .from(heartbeats)
    .where(and(eq(heartbeats.deviceId, deviceId), gte(heartbeats.receivedAt, sinceMs)))
    .limit(receiptsMax);
}

// One metric out of each reading's JSON. The key pattern admits `.`, so the path quotes it; it
// admits no `"`, so the quoting cannot be broken out of.
export function metricSamples(
  db: Db,
  query: { deviceId: string; source: string; metric: string; fromMs: number; toMs: number },
  limit: number,
) {
  const value = sql<number | null>`json_extract(${readings.values}, ${`$."${query.metric}"`})`;
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

export function layoutsOf(db: Db, deviceId: string) {
  return db
    .select({ name: layouts.name, body: layouts.body, updatedAt: layouts.updatedAt })
    .from(layouts)
    .where(eq(layouts.deviceId, deviceId))
    .orderBy(asc(layouts.name))
    .limit(layoutsPerDeviceMax);
}
