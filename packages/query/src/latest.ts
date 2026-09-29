import type { Db } from "@magellan/db";

import { noDevice, type Answer, type ValueRow } from "./api.ts";
import { exponentsOf } from "./metric.ts";
import { dayMs } from "./query.ts";
import {
  declarationOf,
  manifestsOf,
  selectCurrentManifest,
  selectDevice,
  selectLatestReading,
} from "./read.ts";
import { scale } from "./series.ts";
import { instantOf } from "./time.ts";

// Each current metric's value in its source's latest reading, raw: a counter is its running total,
// not a delta. One row read a source, so a stat panel costs what the manifest has sources; a metric
// that reading left out, or a source silent past the lookback, answers null rather than a search.
export async function readLatest(
  db: Db,
  deviceId: string,
  nowMs: number,
): Promise<Answer<ValueRow[]>> {
  const [[device], [currentRow]] = await db.batch([
    selectDevice(db, deviceId),
    selectCurrentManifest(db, deviceId),
  ]);
  if (device === undefined) return noDevice;
  if (currentRow === undefined) return { ok: true, body: [] };

  const { sources } = declarationOf(currentRow).manifest;
  const [first, ...rest] = sources.map((source) =>
    selectLatestReading(db, deviceId, source.id, nowMs - dayMs),
  );
  if (first === undefined) throw new Error("a manifest without sources");
  const latest = (await db.batch([first, ...rest])).map((rows) => rows[0]);

  const hashes = new Set(latest.flatMap((row) => (row === undefined ? [] : [row.manifestHash])));
  const declarations = await manifestsOf(db, deviceId, [...hashes]);

  const body = sources.flatMap((source, index) => {
    const row = latest[index];
    return source.metrics.map((metric): ValueRow => {
      const value = row?.values[metric.key];
      if (row === undefined || value === undefined) {
        return { time: null, source: source.id, metric: metric.key, value: null };
      }
      // Ingest refuses a value its manifest does not declare, so the row's manifest declares it.
      const exponent = exponentsOf(declarations, source.id, metric.key).get(row.manifestHash);
      if (exponent === undefined) throw new Error(`manifest ${row.manifestHash} lacks the metric`);
      return {
        time: instantOf(row.ts),
        source: source.id,
        metric: metric.key,
        value: scale(value, exponent),
      };
    });
  });
  return { ok: true, body };
}
