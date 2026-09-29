import type { Db } from "@magellan/db";

import type { Answer, ValueRow } from "./api.ts";
import { dayMs } from "./bucket.ts";
import { readDeclaration } from "./devices.ts";
import { exponentLookup } from "./metric.ts";
import { manifestsOf, selectLatestReading } from "./read.ts";
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
  const current = await readDeclaration(db, deviceId);
  if (!current.ok) return current;
  if (current.body === undefined) return { ok: true, body: [] };

  const { sources } = current.body.manifest;
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
      const exponent = exponentLookup(declarations, source.id, metric.key)(row.manifestHash);
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
