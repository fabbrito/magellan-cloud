import type { Db } from "@magellan/db";

import { noDevice, type Answer, type DeviceDetail, type DeviceSummary } from "./api.ts";
import { seqGaps } from "./health.ts";
import { dayMs } from "./query.ts";
import {
  declarationOf,
  heartbeatOf,
  selectCurrentManifest,
  selectDevice,
  selectDevices,
  selectLatestHeartbeat,
  selectReceipts,
} from "./read.ts";

export async function deviceSummaries(db: Db): Promise<DeviceSummary[]> {
  const rows = await selectDevices(db);
  return rows.map((row) => ({ id: row.id, description: row.description, last_seen: row.lastSeen }));
}

// One round trip: each read names the device, so none waits on another.
export async function deviceDetail(
  db: Db,
  deviceId: string,
  nowMs: number,
): Promise<Answer<DeviceDetail>> {
  const [[device], [manifest], [heartbeat], receipts] = await db.batch([
    selectDevice(db, deviceId),
    selectCurrentManifest(db, deviceId),
    selectLatestHeartbeat(db, deviceId),
    selectReceipts(db, deviceId, nowMs - dayMs),
  ]);
  if (device === undefined) return noDevice;

  const declaration = manifest === undefined ? undefined : declarationOf(manifest);
  return {
    ok: true,
    body: {
      id: device.id,
      description: device.description,
      manifest:
        declaration === undefined
          ? null
          : {
              hash: declaration.hash,
              declared_at: declaration.declaredAt,
              body: declaration.manifest,
            },
      heartbeat: heartbeat === undefined ? null : heartbeatOf(heartbeat),
      seq_gaps: seqGaps(receipts),
    },
  };
}
