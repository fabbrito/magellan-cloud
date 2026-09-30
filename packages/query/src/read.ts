import { manifestSchema } from "@magellan/contract";
import { batches, devices, heartbeats, manifests, readings, type Db } from "@magellan/db";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { Declaration } from "./metric.ts";

// Row reads, left unawaited so a caller batches the independent ones into one round trip. Every read
// here is bounded where it runs: the limit a caller trusts is the one in the query.
export const devicesMax = 100;
// A day of receipts is ~300 at a five-minute sweep; this leaves room for a device catching up.
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

export function selectDevices(db: Db) {
  return db
    .select({ id: devices.id, description: devices.description, revokedAt: devices.revokedAt })
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

// The key's descending walk stops at the first row.
export function selectLatestHeartbeat(db: Db, deviceId: string) {
  return db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.deviceId, deviceId))
    .orderBy(desc(heartbeats.receivedAt))
    .limit(1);
}

export function selectLatestReceipt(db: Db, deviceId: string) {
  return db
    .select({ bootId: batches.bootId, seq: batches.seq, receivedAt: batches.receivedAt })
    .from(batches)
    .where(eq(batches.deviceId, deviceId))
    .orderBy(desc(batches.receivedAt))
    .limit(1);
}

export function selectReceipts(db: Db, deviceId: string, sinceMs: number) {
  return db
    .select({ bootId: batches.bootId, seq: batches.seq })
    .from(batches)
    .where(and(eq(batches.deviceId, deviceId), gte(batches.receivedAt, sinceMs)))
    .limit(receiptsMax);
}

// The key's descending walk stops at the first row, so this reads one row however long the history.
export function selectLatestReading(db: Db, deviceId: string, source: string, sinceMs: number) {
  return db
    .select({ ts: readings.ts, manifestHash: readings.manifestHash, values: readings.values })
    .from(readings)
    .where(
      and(eq(readings.deviceId, deviceId), eq(readings.source, source), gte(readings.ts, sinceMs)),
    )
    .orderBy(desc(readings.ts))
    .limit(1);
}

export interface SampleQuery {
  deviceId: string;
  source: string;
  keys: string[];
  fromMs: number;
  toMs: number;
}

// The asked metrics out of each reading's JSON, as one array in the keys' order: a metric the
// reading left out is null in it. The key pattern admits `.`, so each path quotes its key; it admits
// no `"`, so the quoting cannot be broken out of.
export function selectSamples(db: Db, query: SampleQuery, limit: number) {
  const paths = query.keys.map((key) => sql`json_extract(${readings.values}, ${`$."${key}"`})`);
  const values = sql<string>`json_array(${sql.join(paths, sql`, `)})`;
  return db
    .select({ ts: readings.ts, manifestHash: readings.manifestHash, values })
    .from(readings)
    .where(
      and(
        eq(readings.deviceId, query.deviceId),
        eq(readings.source, query.source),
        gte(readings.ts, query.fromMs),
        lt(readings.ts, query.toMs),
      ),
    )
    .orderBy(asc(readings.ts))
    .limit(limit);
}

// Throws on what `selectSamples` did not build: a bug here, never the caller's.
export function sampleValuesOf(json: string, count: number): (number | null)[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length !== count)
    throw new Error("a malformed values array");
  return parsed.map((value: unknown) => {
    if (value === null || typeof value === "number") return value;
    throw new Error("a value neither a number nor null");
  });
}
