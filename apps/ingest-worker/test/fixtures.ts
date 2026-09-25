import { LIMITS, type Manifest, type Reading } from "@magellan/contract";

// One source, one gauge: enough for a batch to name and for the manifest check to refuse what it
// does not declare. Bytes, not the object — the hash is over what is sent (docs/DESIGN.md §6).
export const manifest: Manifest = {
  tz: "UTC",
  sources: [
    { id: "inlet", metrics: [{ key: "temperature", kind: "gauge", unit: "C", exponent: -1 }] },
  ],
};

export const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

// The contract's ceiling, not a typical device: one source declaring `metricsPerSourceMax` metrics,
// which is what a full batch carries a value for in every reading.
export const widestManifest: Manifest = {
  tz: "UTC",
  sources: [
    {
      id: "inlet",
      metrics: Array.from({ length: LIMITS.metricsPerSourceMax }, (_unused, index) => ({
        key: `metric_${String(index).padStart(3, "0")}`,
        kind: "gauge" as const,
        unit: "C",
        exponent: -1,
      })),
    },
  ],
};

export const widestManifestBytes = new TextEncoder().encode(JSON.stringify(widestManifest));

export function fullBatchReadings(firstTs: number): Reading[] {
  const values = Object.fromEntries(
    widestManifest.sources[0]?.metrics.map((metric) => [metric.key, 213]) ?? [],
  );

  return Array.from({ length: LIMITS.readingsPerBatchMax }, (_unused, index) => ({
    source: "inlet",
    ts: firstTs + index,
    values,
  }));
}
