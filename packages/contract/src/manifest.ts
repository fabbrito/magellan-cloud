import type { Manifest, Metric } from "./schema.ts";

// The index ingest writes D1 rows from; the checker resolves a batch against the same shape, so the
// mapping from manifest to source→metric is built once and owned here.
export function indexManifest(manifest: Manifest): Map<string, Map<string, Metric>> {
  return new Map(
    manifest.sources.map((source) => [
      source.id,
      new Map(source.metrics.map((metric) => [metric.key, metric])),
    ]),
  );
}
