import type { Metric } from "@magellan/contract";
import type { Db } from "@magellan/db";
import { z } from "zod";

import { noDevice, type Answer, type Series, type SeriesData } from "./api.ts";
import { describeMetric, exponentLookup, metricOf } from "./metric.ts";
import {
  declarationOf,
  manifestsOf,
  selectCurrentManifest,
  selectDevice,
  selectSamples,
} from "./read.ts";
import {
  counterIntervals,
  counterSegments,
  gaugePoints,
  stateRuns,
  type Sample,
} from "./series.ts";

// The source and metric are the resource, in the path; only the window is a filter.

// The window a read takes when none is asked for, and the one health is judged over.
export const dayMs = 24 * 60 * 60 * 1000;
// A month of one reading every five minutes is ~9000 rows; a denser range is narrowed, not paged.
const windowMsMax = 31 * dayMs;
const samplesMax = 10_000;
// D1 binds at most 100 parameters a statement, and the manifest read binds each hash plus the id.
const manifestsPerRangeMax = 90;

const msSchema = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);

// Both bounds or neither: half a window would be a guess. Neither is the last day, resolved against
// the clock by `windowOf`, so the schema stays pure.
export const seriesQuerySchema = z
  .object({ from: msSchema.optional(), to: msSchema.optional() })
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: "from and to come together",
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.to > query.from, {
    message: "to is after from",
  })
  .refine(
    (query) =>
      query.from === undefined || query.to === undefined || query.to - query.from <= windowMsMax,
    { message: "range past a month" },
  );

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

function dataOf(metric: Metric, samples: Sample[]): SeriesData {
  switch (metric.kind) {
    case "gauge":
      return { kind: "gauge", points: gaugePoints(samples) };
    case "counter":
      return {
        kind: "counter",
        intervals: counterIntervals(samples),
        segments: counterSegments(samples),
      };
    case "state":
      return { kind: "state", runs: stateRuns(samples) };
  }
}

export interface SeriesRequest {
  deviceId: string;
  source: string;
  key: string;
  query: SeriesQuery;
}

// 404 for a device never registered or a metric never declared; 422 for a range too dense or
// re-declared too often to answer in one read.
export async function readSeries(
  db: Db,
  request: SeriesRequest,
  nowMs: number,
): Promise<Answer<Series>> {
  const { deviceId, source, key } = request;
  const window = windowOf(request.query, nowMs);

  const [[device], rows, [currentRow]] = await db.batch([
    selectDevice(db, deviceId),
    selectSamples(db, { deviceId, source, key, ...window }, samplesMax + 1),
    selectCurrentManifest(db, deviceId),
  ]);
  if (device === undefined) return noDevice;
  if (rows.length > samplesMax) {
    return { ok: false, status: 422, title: `More than ${samplesMax} readings; narrow the range` };
  }

  const current = currentRow === undefined ? undefined : declarationOf(currentRow);
  const hashes = new Set(rows.map((row) => row.manifestHash));
  if (current !== undefined) hashes.add(current.hash);
  if (hashes.size > manifestsPerRangeMax) {
    return { ok: false, status: 422, title: "Too many manifests in range; narrow it" };
  }

  const declarations = await manifestsOf(db, deviceId, [...hashes]);
  const metric = describeMetric(declarations, source, key);
  if (metric === undefined) {
    return { ok: false, status: 404, title: "No manifest declares this metric" };
  }

  const exponentOf = exponentLookup(declarations, source, key);
  const samples = rows.map((row) => {
    if (row.value === null) throw new Error("a null the query excludes");
    return { ts: row.ts, exponent: exponentOf(row.manifestHash), value: row.value };
  });

  const declared = current !== undefined && metricOf(current.manifest, source, key) !== undefined;

  return { ok: true, body: { metric, declared, data: dataOf(metric, samples) } };
}
