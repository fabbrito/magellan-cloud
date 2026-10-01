import type { Batch, Heartbeat } from "@magellan/contract";
import { heartbeats, readings, receipts, type Db } from "@magellan/db";

// D1 allows 100 bound parameters a statement, and a reading binds one per column. Rows beyond that
// answer `too many SQL variables`, which a full batch reaches and nothing smaller does — see
// apps/ingest-worker/test/ceiling.test.ts, which is what pins this.
const boundParametersMax = 100;
const readingColumns = 5;
export const readingsPerInsertMax = Math.floor(boundParametersMax / readingColumns);

export function chunk<Row>(rows: Row[], size: number): Row[][] {
  const chunks: Row[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}

export function receiptRowOf(deviceId: string, batch: Batch, receivedAt: Date) {
  return {
    deviceId,
    bootId: batch.boot_id,
    seq: batch.seq,
    manifestHash: batch.manifest_hash,
    receivedAt: receivedAt.getTime(),
  };
}

// One row a reading, each under the manifest its batch names.
export function readingRowsOf(deviceId: string, batch: Batch) {
  return batch.readings.map((reading) => ({
    deviceId,
    source: reading.source,
    ts: reading.ts,
    manifestHash: batch.manifest_hash,
    values: reading.values,
  }));
}

// One `db.batch` is one implicit transaction: the readings and their receipt land together or not
// at all (docs/DESIGN.md invariant 5). The conflict clause is the dedup — a replayed batch collides
// row for row and vanishes (docs/adr/0003-dedup-is-the-readings-own-key.md).
export async function commitBatch(
  db: Db,
  deviceId: string,
  batch: Batch,
  receivedAt: Date,
): Promise<void> {
  const receipt = db
    .insert(receipts)
    .values(receiptRowOf(deviceId, batch, receivedAt))
    .onConflictDoNothing();

  await db.batch([
    receipt,
    ...chunk(readingRowsOf(deviceId, batch), readingsPerInsertMax).map((batched) =>
      db.insert(readings).values(batched).onConflictDoNothing(),
    ),
  ]);
}

// An optional field the device left out is stored null, never absent.
export function heartbeatRowOf(deviceId: string, heartbeat: Heartbeat, receivedAt: Date) {
  return {
    deviceId,
    receivedAt: receivedAt.getTime(),
    bootId: heartbeat.boot_id,
    uptimeSeconds: heartbeat.uptime_seconds,
    bufferDepth: heartbeat.buffer_depth,
    batteryPercent: heartbeat.battery_percent ?? null,
    signalPercent: heartbeat.signal_percent ?? null,
    firmwareVersion: heartbeat.firmware_version ?? null,
    sourcesLastHeard: heartbeat.sources_last_heard,
  };
}

// One row, one write. A second heartbeat in the same millisecond is absorbed: the device sends one
// an hour, and either says the same.
export async function commitHeartbeat(
  db: Db,
  deviceId: string,
  heartbeat: Heartbeat,
  receivedAt: Date,
): Promise<void> {
  await db
    .insert(heartbeats)
    .values(heartbeatRowOf(deviceId, heartbeat, receivedAt))
    .onConflictDoNothing();
}
