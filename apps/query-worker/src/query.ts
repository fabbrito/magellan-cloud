import type { Metric } from "@magellan/contract";
import type { Db } from "@magellan/db";
import { z } from "zod";

import type { Series, SeriesData } from "./api.ts";
import { describeMetric, exponentsOf, metricOf } from "./metric.ts";
import { currentManifest, manifestsOf, metricSamples, type SampleQuery } from "./read.ts";
import {
  counterIntervals,
  counterSegments,
  gaugePoints,
  stateRuns,
  type Sample,
} from "./series.ts";

// The source and metric are the resource, in the path; only the window is a filter.

// A month of one reading every five minutes is ~9000 rows; a denser range is narrowed, not paged.
const windowMsMax = 31 * 24 * 60 * 60 * 1000;
const samplesMax = 10_000;
// D1 binds at most 100 parameters a statement, and the manifest read binds each hash plus the id.
const manifestsPerRangeMax = 90;

const msSchema = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);

export const seriesQuerySchema = z
  .object({ from: msSchema, to: msSchema })
  .refine((query) => query.to > query.from, { message: "to is after from" })
  .refine((query) => query.to - query.from <= windowMsMax, { message: "range past a month" })
  .transform((query) => ({ fromMs: query.from, toMs: query.to }));

export type SeriesResult =
  | { ok: true; series: Series }
  | { ok: false; status: 404 | 422; title: string };

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

// The device is known. 404 for a metric never declared; 422 for a range too dense or re-declared too often
// to answer in one read.
export async function readSeries(db: Db, query: SampleQuery): Promise<SeriesResult> {
  const rows = await metricSamples(db, query, samplesMax + 1);
  if (rows.length > samplesMax) {
    return { ok: false, status: 422, title: `More than ${samplesMax} readings; narrow the range` };
  }

  const current = await currentManifest(db, query.deviceId);
  const hashes = new Set(rows.map((row) => row.manifestHash));
  if (current !== undefined) hashes.add(current.hash);
  if (hashes.size > manifestsPerRangeMax) {
    return { ok: false, status: 422, title: "Too many manifests in range; narrow it" };
  }

  const declarations = await manifestsOf(db, query.deviceId, [...hashes]);
  const metric = describeMetric(declarations, query.source, query.key);
  if (metric === undefined) {
    return { ok: false, status: 404, title: "No manifest declares this metric" };
  }

  // Ingest refuses a value its manifest does not declare, so every row's hash declares this key.
  const exponents = exponentsOf(declarations, query.source, query.key);
  const samples = rows.map((row) => {
    const exponent = exponents.get(row.manifestHash);
    if (exponent === undefined) throw new Error(`manifest ${row.manifestHash} lacks the metric`);
    if (row.value === null) throw new Error("a null the query excludes");
    return { ts: row.ts, exponent, value: row.value };
  });

  const declared =
    current !== undefined && metricOf(current.manifest, query.source, query.key) !== undefined;

  return { ok: true, series: { metric, declared, data: dataOf(metric, samples) } };
}
