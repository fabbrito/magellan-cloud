import { keySchema, type Metric } from "@magellan/contract";
import type { Db } from "@magellan/db";
import { z } from "zod";

import type { Answer, ValueRow } from "./api.ts";
import { bucketsOf, dayMs, spansOf, type Rollup } from "./bucket.ts";
import { readDeclaration } from "./devices.ts";
import { describeMetric, exponentLookup, type Declaration } from "./metric.ts";
import {
  bucketRowOf,
  manifestsOf,
  sampleValuesOf,
  selectBuckets,
  selectSamples,
  type BucketRow,
} from "./read.ts";
import { bucketPoints, readingPoints, type Point } from "./rollup.ts";
import type { Sample } from "./series.ts";
import { instantOf } from "./time.ts";

// Readings pass through, so the bound is on readings read, and a range past it is narrowed, not
// paged: a week of one reading a minute fits. Buckets are aggregated in D1, so the bound is on
// buckets — the Worker cuts each in the device's zone — and 90 days of hours fits, the longest
// range the default answers by hour. Rows answered are bounded apart: many metrics answer more
// rows than readings or buckets read.
const readingsMax = 10_000;
const bucketsMax = 2_400;
const rowsMax = 10_000;
const metricsMax = 20;
// D1 binds at most 100 parameters a statement, and the manifest read binds each hash plus the id.
const manifestsPerRangeMax = 90;

const instantSchema = z.union([
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number),
  z.iso.datetime({ offset: true }).transform((iso) => Date.parse(iso)),
]);

const boundDescription =
  "Epoch milliseconds or RFC 3339. With the other bound, or neither: the last day.";

// `source:key`: the key pattern admits no `:`, so the first one splits.
const metricRefSchema = z
  .string()
  .transform((ref) => ref.split(":"))
  .pipe(z.tuple([keySchema, keySchema]))
  .transform(([source, key]) => ({ source, key }));

export type MetricRef = z.infer<typeof metricRefSchema>;

// A metric as a query names it: the form `metricRefSchema` parses.
export function refName(ref: MetricRef): string {
  return `${ref.source}:${ref.key}`;
}

const metricRefsSchema = z
  .string()
  .transform((refs) => refs.split(","))
  .pipe(z.array(metricRefSchema).min(1).max(metricsMax))
  .refine((refs) => new Set(refs.map(refName)).size === refs.length, {
    message: "a metric asked twice",
  })
  .meta({ description: `Comma-separated \`source:key\`, 1 to ${metricsMax}, each once.` });

// Both bounds or neither: half a window would be a guess. Neither is the last day, resolved against
// the clock by `windowOf`, so the schema stays pure.
export const seriesQuerySchema = z
  .object({
    metric: metricRefsSchema,
    from: instantSchema.optional().meta({ description: `${boundDescription} Inclusive.` }),
    to: instantSchema.optional().meta({ description: `${boundDescription} Exclusive.` }),
    rollup: z.enum(["reading", "hour", "day"]).optional().meta({
      description:
        "Hour and day buckets are cut in the device's zone. Left out: reading to 2 days, hour to 90, day past.",
    }),
  })
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: "from and to come together",
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.to > query.from, {
    message: "to is after from",
  });

export type SeriesQuery = z.infer<typeof seriesQuerySchema>;

export interface Window {
  fromMs: number;
  toMs: number;
}

export function windowOf(query: SeriesQuery, nowMs: number): Window {
  if (query.from === undefined || query.to === undefined) {
    return { fromMs: nowMs - dayMs, toMs: nowMs };
  }
  return { fromMs: query.from, toMs: query.to };
}

// Readings while a chart can show each one, hours while a range is weeks, days past that.
export function rollupOf(query: SeriesQuery, window: Window): Rollup {
  if (query.rollup !== undefined) return query.rollup;
  const spanMs = window.toMs - window.fromMs;
  if (spanMs <= 2 * dayMs) return "reading";
  if (spanMs <= 90 * dayMs) return "hour";
  return "day";
}

function coarserThan(rollup: Rollup): string {
  if (rollup === "reading") return "ask rollup=hour";
  if (rollup === "hour") return "ask rollup=day";
  return "narrow the range";
}

// What a read found before its manifests resolve: the hashes it names, and an asked metric's points
// once they have.
interface Found {
  hashes: Set<string>;
  pointsOf(metric: Metric, ref: MetricRef, declarations: Declaration[]): Point[];
}

type Refusal = { ok: false; status: 422; title: string };

function keysBySourceOf(refs: MetricRef[]): [string, string[]][] {
  const keysBySource = new Map<string, string[]>();
  for (const ref of refs)
    keysBySource.set(ref.source, [...(keysBySource.get(ref.source) ?? []), ref.key]);
  return [...keysBySource];
}

// Each source's rows, looked up by the source a ref names: a source asked is a source read.
function rowsOf<Rows>(bySource: Map<string, Rows>, ref: MetricRef): Rows {
  const rows = bySource.get(ref.source);
  if (rows === undefined) throw new Error(`source ${ref.source} was not read`);
  return rows;
}

export interface SeriesRequest {
  deviceId: string;
  query: SeriesQuery;
}

// 404 for a device never registered or a metric never declared; 422 for a range too dense or
// re-declared too often to answer in one read.
export async function readSeries(
  db: Db,
  request: SeriesRequest,
  nowMs: number,
): Promise<Answer<ValueRow[], 404 | 422>> {
  const { deviceId, query } = request;
  const declared = await readDeclaration(db, deviceId);
  if (!declared.ok) return declared;
  const current = declared.body;

  const window = windowOf(query, nowMs);
  const rollup = rollupOf(query, window);
  const found =
    rollup === "reading"
      ? await readReadings(db, deviceId, query.metric, window)
      : // Calendar days are cut in the device's zone; a device yet to declare has none to cut.
        await readBuckets(db, deviceId, query.metric, window, {
          rollup,
          tz: current?.manifest.tz ?? "UTC",
        });
  if ("ok" in found) return found;

  const hashes = new Set(found.hashes);
  if (current !== undefined) hashes.add(current.hash);
  if (hashes.size > manifestsPerRangeMax) {
    return { ok: false, status: 422, title: "Too many manifests in range; narrow it" };
  }
  const declarations = await manifestsOf(db, deviceId, [...hashes]);

  const labelled: { point: Point; ref: MetricRef }[] = [];
  for (const ref of query.metric) {
    const metric = describeMetric(declarations, ref.source, ref.key);
    if (metric === undefined) {
      return { ok: false, status: 404, title: `No manifest declares ${refName(ref)}` };
    }
    const points = found.pointsOf(metric, ref, declarations);
    if (labelled.length + points.length > rowsMax) {
      return { ok: false, status: 422, title: `More than ${rowsMax} rows; ${coarserThan(rollup)}` };
    }
    for (const point of points) labelled.push({ point, ref });
  }
  // Time order across metrics, asked order within a time: a long table only splits into series
  // (Grafana's long-to-wide) when its times ascend. The sort is stable.
  const body: ValueRow[] = labelled
    .toSorted((left, right) => left.point.ts - right.point.ts)
    .map(({ point, ref }) => ({
      time: instantOf(point.ts),
      source: ref.source,
      metric: ref.key,
      value: point.value,
    }));
  return { ok: true, body };
}

// One source's readings, each asked metric's value beside its reading's manifest.
interface SourceRows {
  keys: string[];
  rows: { ts: number; manifestHash: string; values: (number | null)[] }[];
}

function samplesOf(declarations: Declaration[], source: SourceRows, ref: MetricRef): Sample[] {
  const index = source.keys.indexOf(ref.key);
  const exponentOf = exponentLookup(declarations, ref.source, ref.key);
  return source.rows.flatMap((row) => {
    const value = row.values[index];
    if (value === undefined) throw new Error("a key past the values array");
    if (value === null) return [];
    return [{ ts: row.ts, exponent: exponentOf(row.manifestHash), value }];
  });
}

// One statement a source, all in one round trip; each reads one past its bound, so a range over it
// is refused rather than truncated.
async function readReadings(
  db: Db,
  deviceId: string,
  refs: MetricRef[],
  window: Window,
): Promise<Found | Refusal> {
  const sources = keysBySourceOf(refs);
  const [first, ...rest] = sources.map(([source, keys]) =>
    selectSamples(db, { deviceId, source, keys, ...window }, readingsMax + 1),
  );
  if (first === undefined) throw new Error("a series with no metrics");
  const results = await db.batch([first, ...rest]);
  const bySource = new Map(
    sources.map(([source, keys], index) => {
      const rows = results[index];
      if (rows === undefined) throw new Error("a batch answered short");
      const parsed = rows.map((row) => ({
        ...row,
        values: sampleValuesOf(row.values, keys.length),
      }));
      return [source, { keys, rows: parsed }];
    }),
  );

  const read = [...bySource.values()];
  if (read.reduce((count, source) => count + source.rows.length, 0) > readingsMax) {
    return { ok: false, status: 422, title: `More than ${readingsMax} readings; ask rollup=hour` };
  }
  return {
    hashes: new Set(read.flatMap((source) => source.rows.map((row) => row.manifestHash))),
    pointsOf: (_metric, ref, declarations) =>
      readingPoints(samplesOf(declarations, rowsOf(bySource, ref), ref)),
  };
}

// One source's buckets as D1 aggregated them, keyed by the asked keys' order.
interface SourceBuckets {
  keys: string[];
  rows: BucketRow[];
}

// One statement a source, all in one round trip. Every bucket the window touches is whole, so no
// bucket answers for part of itself.
async function readBuckets(
  db: Db,
  deviceId: string,
  refs: MetricRef[],
  window: Window,
  cut: { rollup: "hour" | "day"; tz: string },
): Promise<Found | Refusal> {
  const buckets = bucketsOf(cut.tz, cut.rollup);
  const spans = spansOf(buckets, window.fromMs, window.toMs, bucketsMax);
  if (spans.length > bucketsMax) {
    const coarser = coarserThan(cut.rollup);
    return { ok: false, status: 422, title: `More than ${bucketsMax} buckets; ${coarser}` };
  }

  const sources = keysBySourceOf(refs);
  const results = await db.$client.batch(
    sources.map(([source, keys]) => selectBuckets(db, { deviceId, source, keys, spans })),
  );
  const bySource = new Map<string, SourceBuckets>(
    sources.map(([source, keys], index) => {
      const result = results[index];
      if (result === undefined) throw new Error("a batch answered short");
      return [source, { keys, rows: result.results.map(bucketRowOf) }];
    }),
  );

  return {
    hashes: new Set([...bySource.values()].flatMap((s) => s.rows.map((row) => row.manifestHash))),
    pointsOf: (metric, ref, declarations) => {
      const source = rowsOf(bySource, ref);
      const keyIndex = source.keys.indexOf(ref.key);
      const exponentOf = exponentLookup(declarations, ref.source, ref.key);
      const groups = source.rows
        .filter((row) => row.keyIndex === keyIndex)
        .map((row) => ({ ...row, exponent: exponentOf(row.manifestHash) }));
      return bucketPoints(metric, groups);
    },
  };
}
