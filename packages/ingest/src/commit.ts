import type { Batch, Heartbeat } from "@magellan/contract";
import { heartbeats, readings, receipts, type Db } from "@magellan/db";

// D1 allows 100 bound parameters a statement, and a reading binds one per column. Rows beyond that
// answer `too many SQL variables`, which a full batch reaches and nothing smaller does — see
// apps/ingest-worker/test/ceiling.test.ts, which is what pins this.
const boundParametersMax = 100;
const readingColumns = 5;
const readingsPerInsertMax = Math.floor(boundParametersMax / readingColumns);

function chunk<Row>(rows: Row[], size: number): Row[][] {
  const chunks: Row[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
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
    .values({
      deviceId,
      bootId: batch.boot_id,
      seq: batch.seq,
      manifestHash: batch.manifest_hash,
      receivedAt: receivedAt.getTime(),
    })
    .onConflictDoNothing();

  const rows = batch.readings.map((reading) => ({
    deviceId,
    source: reading.source,
    ts: reading.ts,
    manifestHash: batch.manifest_hash,
    values: reading.values,
  }));

  await db.batch([
    receipt,
    ...chunk(rows, readingsPerInsertMax).map((batched) =>
      db.insert(readings).values(batched).onConflictDoNothing(),
    ),
  ]);
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
    .values({
      deviceId,
      receivedAt: receivedAt.getTime(),
      bootId: heartbeat.boot_id,
      uptimeSeconds: heartbeat.uptime_seconds,
      bufferDepth: heartbeat.buffer_depth,
      batteryPercent: heartbeat.battery_percent ?? null,
      signalPercent: heartbeat.signal_percent ?? null,
      firmwareVersion: heartbeat.firmware_version ?? null,
      sourcesLastHeard: heartbeat.sources_last_heard,
    })
    .onConflictDoNothing();
}
