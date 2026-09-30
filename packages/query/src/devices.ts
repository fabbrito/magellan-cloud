import type { Manifest } from "@magellan/contract";
import type { Db } from "@magellan/db";

import {
  noDevice,
  type Answer,
  type DeviceRow,
  type HealthRow,
  type MetricRow,
  type SourceHealthRow,
} from "./api.ts";
import { dayMs } from "./bucket.ts";
import { latestArrival, seqGaps } from "./health.ts";
import type { Declaration } from "./metric.ts";
import {
  declarationOf,
  selectCurrentManifest,
  selectDevice,
  selectDevices,
  selectLatestHeartbeat,
  selectLatestReceipt,
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

// The device's current declaration, undefined until it declares one; 404 for a device never
// registered. One round trip, whichever a read goes on to need.
export async function readDeclaration(
  db: Db,
  deviceId: string,
): Promise<Answer<Declaration | undefined>> {
  const [[device], [manifest]] = await db.batch([
    selectDevice(db, deviceId),
    selectCurrentManifest(db, deviceId),
  ]);
  if (device === undefined) return noDevice;
  return { ok: true, body: manifest === undefined ? undefined : declarationOf(manifest) };
}

// A device yet to declare has no metrics, not a missing resource.
export async function readMetrics(db: Db, deviceId: string): Promise<Answer<MetricRow[]>> {
  const current = await readDeclaration(db, deviceId);
  if (!current.ok) return current;
  if (current.body === undefined) return { ok: true, body: [] };
  return { ok: true, body: metricRows(current.body.manifest) };
}

// One round trip: each read names the device, so none waits on another.
export async function readHealth(
  db: Db,
  deviceId: string,
  nowMs: number,
): Promise<Answer<HealthRow[]>> {
  const [[device], [heartbeat], [receipt], receipts] = await db.batch([
    selectDevice(db, deviceId),
    selectLatestHeartbeat(db, deviceId),
    selectLatestReceipt(db, deviceId),
    selectReceipts(db, deviceId, nowMs - dayMs),
  ]);
  if (device === undefined) return noDevice;

  const latest = latestArrival(heartbeat, receipt);
  const row: HealthRow = {
    last_heard: latest === undefined ? null : instantOf(latest.receivedAt),
    seq_gaps: seqGaps(receipts),
    boot_id: latest?.bootId ?? null,
    seq: receipt?.seq ?? null,
    uptime_seconds: heartbeat?.uptimeSeconds ?? null,
    buffer_depth: heartbeat?.bufferDepth ?? null,
    battery_percent: heartbeat?.batteryPercent ?? null,
    signal_percent: heartbeat?.signalPercent ?? null,
    firmware_version: heartbeat?.firmwareVersion ?? null,
  };
  return { ok: true, body: [row] };
}

// Code-unit order: source ids are ASCII, so no locale enters it.
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// The latest heartbeat's account, one row a source, in id order. A device yet to send one, or one
// that has heard no source since boot, answers no rows.
export async function readSourceHealth(
  db: Db,
  deviceId: string,
): Promise<Answer<SourceHealthRow[]>> {
  const [[device], [heartbeat]] = await db.batch([
    selectDevice(db, deviceId),
    selectLatestHeartbeat(db, deviceId),
  ]);
  if (device === undefined) return noDevice;
  if (heartbeat === undefined) return { ok: true, body: [] };

  const body = Object.entries(heartbeat.sourcesLastHeard)
    .toSorted(([left], [right]) => compareText(left, right))
    .map(([source, ms]) => ({ source, last_heard: instantOf(ms) }));
  return { ok: true, body };
}
