import type { Manifest } from "@magellan/contract";
import type { Db } from "@magellan/db";

import { noDevice, type Answer, type DeviceRow, type HealthRow, type MetricRow } from "./api.ts";
import { seqGaps } from "./health.ts";
import { dayMs } from "./query.ts";
import {
  declarationOf,
  selectCurrentManifest,
  selectDevice,
  selectDevices,
  selectLatestHeartbeat,
  selectReceipts,
} from "./read.ts";
import { instantOf } from "./time.ts";

export async function listDevices(db: Db): Promise<DeviceRow[]> {
  const rows = await selectDevices(db);
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    revoked_at: row.revokedAt === null ? null : instantOf(row.revokedAt),
  }));
}

export function metricRows(manifest: Manifest): MetricRow[] {
  return manifest.sources.flatMap((source) =>
    source.metrics.map(({ key, ...metric }) => ({ source: source.id, metric: key, ...metric })),
  );
}

// A device yet to declare has no metrics, not a missing resource.
export async function readMetrics(db: Db, deviceId: string): Promise<Answer<MetricRow[]>> {
  const [[device], [manifest]] = await db.batch([
    selectDevice(db, deviceId),
    selectCurrentManifest(db, deviceId),
  ]);
  if (device === undefined) return noDevice;
  if (manifest === undefined) return { ok: true, body: [] };
  return { ok: true, body: metricRows(declarationOf(manifest).manifest) };
}

// One round trip: each read names the device, so none waits on another.
export async function readHealth(
  db: Db,
  deviceId: string,
  nowMs: number,
): Promise<Answer<HealthRow[]>> {
  const [[device], [heartbeat], receipts] = await db.batch([
    selectDevice(db, deviceId),
    selectLatestHeartbeat(db, deviceId),
    selectReceipts(db, deviceId, nowMs - dayMs),
  ]);
  if (device === undefined) return noDevice;

  const row: HealthRow = {
    last_seen: heartbeat === undefined ? null : instantOf(heartbeat.receivedAt),
    seq_gaps: seqGaps(receipts),
    boot_id: heartbeat?.bootId ?? null,
    seq: heartbeat?.seq ?? null,
    uptime_seconds: heartbeat?.uptimeSeconds ?? null,
    buffer_depth: heartbeat?.bufferDepth ?? null,
    battery_percent: heartbeat?.batteryPercent ?? null,
    signal_percent: heartbeat?.signalPercent ?? null,
    firmware_version: heartbeat?.firmwareVersion ?? null,
  };
  return { ok: true, body: [row] };
}
