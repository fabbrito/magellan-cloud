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
import { bucketPoints, readingPoints, type BucketGroup, type Point } from "./rollup.ts";
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

// One source's answer: each row beside the asked keys' order it was read in.
interface SourceAnswer<Row> {
  keys: string[];
  rows: Row[];
}

type SampleRow = { ts: number; manifestHash: string; values: (number | null)[] };

// A series' rows before their manifests resolve: readings passed through, or buckets D1 aggregated.
type SeriesRows =
  | { rollup: "reading"; bySource: Map<string, SourceAnswer<SampleRow>> }
  | { rollup: "hour" | "day"; bySource: Map<string, SourceAnswer<BucketRow>> };

type Refusal = { ok: false; status: 422; title: string };

function keysBySourceOf(refs: MetricRef[]): [string, string[]][] {
  const keysBySource = new Map<string, string[]>();
  for (const ref of refs)
    keysBySource.set(ref.source, [...(keysBySource.get(ref.source) ?? []), ref.key]);
  return [...keysBySource];
}

// A batch answers in order, one result a statement, so the nth result is the nth source's.
function bySourceOf<Result, Row>(
  sources: [string, string[]][],
  results: Result[],
  parse: (result: Result, keys: string[]) => Row[],
): Map<string, SourceAnswer<Row>> {
  return new Map(
    sources.map(([source, keys], index) => {
      const result = results[index];
      if (result === undefined) throw new Error("a batch answered short");
      return [source, { keys, rows: parse(result, keys) }];
    }),
  );
}

function hashesOf(bySource: Map<string, SourceAnswer<{ manifestHash: string }>>): Set<string> {
  return new Set(
    [...bySource.values()].flatMap((answer) => answer.rows.map((row) => row.manifestHash)),
  );
}

// Each source's rows, looked up by the source a ref names: a source asked is a source read.
function answerOf<Source>(bySource: Map<string, Source>, ref: MetricRef): Source {
  const answer = bySource.get(ref.source);
  if (answer === undefined) throw new Error(`source ${ref.source} was not read`);
  return answer;
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
  // Calendar days are cut in the device's zone; a device yet to declare has none to cut.
  const rows = await readRows(db, { deviceId, query }, window, current?.manifest.tz ?? "UTC");
  if ("ok" in rows) return rows;

  const hashes = hashesOf(rows.bySource);
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
    const points = pointsOf(rows, metric, ref, declarations);
    if (labelled.length + points.length > rowsMax) {
      return {
        ok: false,
        status: 422,
        title: `More than ${rowsMax} rows; ${coarserThan(rows.rollup)}`,
      };
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

function samplesOf(
  declarations: Declaration[],
  answer: SourceAnswer<SampleRow>,
  ref: MetricRef,
): Sample[] {
  const index = answer.keys.indexOf(ref.key);
  const exponentOf = exponentLookup(declarations, ref.source, ref.key);
  return answer.rows.flatMap((row) => {
    const value = row.values[index];
    if (value === undefined) throw new Error("a key past the values array");
    if (value === null) return [];
    return [{ ts: row.ts, exponent: exponentOf(row.manifestHash), value }];
  });
}

function groupsOf(
  declarations: Declaration[],
  answer: SourceAnswer<BucketRow>,
  ref: MetricRef,
): BucketGroup[] {
  const keyIndex = answer.keys.indexOf(ref.key);
  const exponentOf = exponentLookup(declarations, ref.source, ref.key);
  return answer.rows
    .filter((row) => row.keyIndex === keyIndex)
    .map((row) => ({ ...row, exponent: exponentOf(row.manifestHash) }));
}

function pointsOf(
  rows: SeriesRows,
  metric: Metric,
  ref: MetricRef,
  declarations: Declaration[],
): Point[] {
  switch (rows.rollup) {
    case "reading":
      return readingPoints(samplesOf(declarations, answerOf(rows.bySource, ref), ref));
    case "hour":
    case "day":
      return bucketPoints(metric, groupsOf(declarations, answerOf(rows.bySource, ref), ref));
  }
}

// Readings or buckets, whichever the rollup asks, each bounded before it is read.
async function readRows(
  db: Db,
  request: SeriesRequest,
  window: Window,
  tz: string,
): Promise<SeriesRows | Refusal> {
  const { deviceId, query } = request;
  const rollup = rollupOf(query, window);
  if (rollup === "reading") return readReadings(db, deviceId, query.metric, window);

  // Every bucket the window touches is whole, so no bucket answers for part of itself.
  const spans = spansOf(bucketsOf(tz, rollup), window.fromMs, window.toMs, bucketsMax);
  if (spans.length > bucketsMax) {
    const coarser = coarserThan(rollup);
    return { ok: false, status: 422, title: `More than ${bucketsMax} buckets; ${coarser}` };
  }
  return readBuckets(db, deviceId, query.metric, spans, rollup);
}

// One statement a source, all in one round trip; each reads one past its bound, so a range over it
// is refused rather than truncated.
async function readReadings(
  db: Db,
  deviceId: string,
  refs: MetricRef[],
  window: Window,
): Promise<SeriesRows | Refusal> {
  const sources = keysBySourceOf(refs);
  const [first, ...rest] = sources.map(([source, keys]) =>
    selectSamples(db, { deviceId, source, keys, ...window }, readingsMax + 1),
  );
  if (first === undefined) throw new Error("a series with no metrics");
  const results = await db.batch([first, ...rest]);
  const bySource = bySourceOf(sources, results, (result, keys) =>
    result.map((row) => ({ ...row, values: sampleValuesOf(row.values, keys.length) })),
  );

  const readCount = [...bySource.values()].reduce((count, answer) => count + answer.rows.length, 0);
  if (readCount > readingsMax) {
    const coarser = coarserThan("reading");
    return { ok: false, status: 422, title: `More than ${readingsMax} readings; ${coarser}` };
  }
  return { rollup: "reading", bySource };
}

// One statement a source, all in one round trip.
async function readBuckets(
  db: Db,
  deviceId: string,
  refs: MetricRef[],
  spans: [number, number][],
  rollup: "hour" | "day",
): Promise<SeriesRows> {
  const sources = keysBySourceOf(refs);
  const results = await db.$client.batch(
    sources.map(([source, keys]) => selectBuckets(db, { deviceId, source, keys, spans })),
  );
  const bySource = bySourceOf(sources, results, (result) => result.results.map(bucketRowOf));
  return { rollup, bySource };
}
