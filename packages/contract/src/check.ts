import { indexManifest } from "./manifest.ts";
import type { Batch, Manifest } from "./schema.ts";

// Zod accepts a batch in isolation; meaning comes from the manifest it names. Ingest calls this
// once `manifest_hash` is resolved, and maps a refusal to 4xx — the class a device must not retry.
// Integrality is the schema's now, so what is left is whether the manifest declares what was sent.
export type BatchRejectionReason = "source_unknown" | "metric_unknown";

export type BatchCheck =
  | { ok: true }
  | { ok: false; reason: BatchRejectionReason; source: string; metric?: string };

export function checkBatchAgainstManifest(manifest: Manifest, batch: Batch): BatchCheck {
  const metricsBySource = indexManifest(manifest);

  for (const reading of batch.readings) {
    // The registry is the cloud's declaration of what exists; a device never widens it by sending.
    const metrics = metricsBySource.get(reading.source);
    if (metrics === undefined) {
      return { ok: false, reason: "source_unknown", source: reading.source };
    }

    for (const metricKey of Object.keys(reading.values)) {
      if (!metrics.has(metricKey)) {
        return { ok: false, reason: "metric_unknown", source: reading.source, metric: metricKey };
      }
    }
  }

  return { ok: true };
}
