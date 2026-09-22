import type { Batch } from "@magellan/contract";
import { heartbeats, readings, type Db } from "@magellan/db";

// D1 publishes a 100 KB ceiling per statement but no bound-parameter limit, and SQLite's variable
// cap is what actually binds. Four parameters a row, so 100 rows is well inside either.
const readingsPerInsertMax = 100;

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
    .insert(heartbeats)
    .values({
      deviceId,
      bootId: batch.boot_id,
      seq: batch.seq,
      manifestHash: batch.manifest_hash,
      uptimeSeconds: batch.heartbeat.uptime_seconds,
      bufferDepth: batch.heartbeat.buffer_depth,
      batteryPercent: batch.heartbeat.battery_percent ?? null,
      signalPercent: batch.heartbeat.signal_percent ?? null,
      firmwareVersion: batch.heartbeat.firmware_version ?? null,
      receivedAt: receivedAt.getTime(),
    })
    .onConflictDoNothing();

  const rows = batch.readings.map((reading) => ({
    deviceId,
    source: reading.source,
    ts: reading.ts,
    values: reading.values,
  }));

  await db.batch([
    receipt,
    ...chunk(rows, readingsPerInsertMax).map((batched) =>
      db.insert(readings).values(batched).onConflictDoNothing(),
    ),
  ]);
}
