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

export interface BucketQuery {
  deviceId: string;
  source: string;
  keys: string[];
  // Each bucket as `[start, end)`, ascending.
  spans: [number, number][];
}

// One row a bucket, manifest and asked key with a value in it: a gauge's sum and count, and the last
// value by `ts`. Grouped by manifest because the exponent is its; a bucket straddling a re-declare
// answers a row for each, merged by the caller. `TOTAL`, not `SUM`: its float never overflows. The
// last value is a key lookup on the row the group's `MAX(ts)` names. Each bucket is a range walk of
// the readings key, so the rows read are the readings in range plus one a row answered.
//
// The buckets and the keys ride as one JSON parameter each: D1 binds at most 100 a statement. A key
// admits no `"`, so a path quoting it cannot be broken out of. Raw D1, not drizzle: drizzle's batch
// takes no raw statement, and a CTE over `json_each` has no builder.
const bucketsSql = `
  WITH b AS (SELECT value ->> 0 AS start, value ->> 1 AS stop FROM json_each(?1)),
  k AS (SELECT key AS key_index, '$."' || value || '"' AS path FROM json_each(?2)),
  g AS (
    SELECT b.start, r.manifest_hash, k.key_index, k.path,
      TOTAL(json_extract(r."values", k.path)) AS total,
      COUNT(json_extract(r."values", k.path)) AS count,
      MAX(CASE WHEN json_extract(r."values", k.path) IS NOT NULL THEN r.ts END) AS last_ts
    FROM b CROSS JOIN readings r CROSS JOIN k
    WHERE r.device_id = ?3 AND r.source = ?4 AND r.ts >= b.start AND r.ts < b.stop
    GROUP BY b.start, r.manifest_hash, k.key_index
    HAVING count > 0
  )
  SELECT g.start, g.manifest_hash, g.key_index, g.total, g.count, g.last_ts,
    json_extract(l."values", g.path) AS last
  FROM g CROSS JOIN readings l
  WHERE l.device_id = ?3 AND l.source = ?4 AND l.ts = g.last_ts
  ORDER BY g.start
`;

export function selectBuckets(db: Db, query: BucketQuery) {
  return db.$client
    .prepare(bucketsSql)
    .bind(JSON.stringify(query.spans), JSON.stringify(query.keys), query.deviceId, query.source);
}

export interface BucketRow {
  start: number;
  manifestHash: string;
  keyIndex: number;
  total: number;
  count: number;
  lastTs: number;
  last: number;
}

function numberOf(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  if (typeof value !== "number") throw new Error(`a bucket row's ${column} is not a number`);
  return value;
}

// Throws on what `selectBuckets` did not build: a bug here, never the caller's.
export function bucketRowOf(row: unknown): BucketRow {
  if (typeof row !== "object" || row === null) throw new Error("a bucket row is not an object");
  const columns = Object.fromEntries(Object.entries(row));
  const manifestHash = columns["manifest_hash"];
  if (typeof manifestHash !== "string") throw new Error("a bucket row's manifest_hash");
  return {
    start: numberOf(columns, "start"),
    manifestHash,
    keyIndex: numberOf(columns, "key_index"),
    total: numberOf(columns, "total"),
    count: numberOf(columns, "count"),
    lastTs: numberOf(columns, "last_ts"),
    last: numberOf(columns, "last"),
  };
}
