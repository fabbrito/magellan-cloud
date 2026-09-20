import { indexManifest } from "./manifest.ts";
import type { Batch, Manifest, Metric } from "./schema.ts";

// Zod accepts a batch in isolation; meaning comes from the manifest it names. Ingest calls this
// once `manifest_hash` is resolved, and maps a refusal to 4xx — the class a device must not retry.
export type BatchRejectionReason =
  | "source_unknown"
  | "metric_unknown"
  | "counter_not_integer"
  | "state_not_integer";

export type BatchCheck =
  | { ok: true }
  | { ok: false; reason: BatchRejectionReason; source: string; metric?: string };

// Which kinds must carry whole numbers. Keyed by the kind union, so a fourth kind is a type error
// rather than a silent fall-through to another kind's reason.
type Integrality = { integral: true; reason: BatchRejectionReason } | { integral: false };

const integralityByKind = {
  gauge: { integral: false },
  counter: { integral: true, reason: "counter_not_integer" },
  state: { integral: true, reason: "state_not_integer" },
} as const satisfies Record<Metric["kind"], Integrality>;

export function checkBatchAgainstManifest(manifest: Manifest, batch: Batch): BatchCheck {
  const metricsBySource = indexManifest(manifest);

  for (const reading of batch.readings) {
    // The registry is the cloud's declaration of what exists; a device does not widen it by sending.
    const metrics = metricsBySource.get(reading.source);
    if (metrics === undefined) {
      return { ok: false, reason: "source_unknown", source: reading.source };
    }

    for (const [metricKey, value] of Object.entries(reading.values)) {
      const metric = metrics.get(metricKey);
      if (metric === undefined) {
        return { ok: false, reason: "metric_unknown", source: reading.source, metric: metricKey };
      }

      // A counter that increments and a state that flips are integral by kind; only a gauge may
      // carry a fraction.
      const integrality = integralityByKind[metric.kind];
      if (integrality.integral && !Number.isInteger(value)) {
        return { ok: false, reason: integrality.reason, source: reading.source, metric: metricKey };
      }
    }
  }

  return { ok: true };
}
