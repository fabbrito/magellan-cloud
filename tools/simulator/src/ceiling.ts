import { LIMITS, type Manifest, type Reading } from "@magellan/contract";

const pad = (prefix: string, index: number) =>
  `${prefix}${String(index).padStart(LIMITS.keyLengthMax - prefix.length, "0")}`;

const keys = Array.from({ length: LIMITS.metricsPerSourceMax }, (_unused, index) =>
  pad("k", index),
);

const stateLabels = Object.fromEntries(
  Array.from({ length: LIMITS.stateLabelsMax }, (_unused, index) => [
    String(index).padStart(LIMITS.stateCodeDigitsMax, "9"),
    "l".repeat(LIMITS.stateLabelLengthMax),
  ]),
);

export const largestManifest: Manifest = {
  // The longest name the tz database holds.
  tz: "America/Argentina/ComodRivadavia",
  sources: Array.from({ length: LIMITS.sourcesMax }, (_unused, index) => ({
    id: pad("s", index),
    metrics: keys.map((key) => ({ key, kind: "state", state_labels: stateLabels })),
  })),
};

// Gauges, since a state value is a code and cannot carry the widest integer.
export const gaugeManifest: Manifest = {
  tz: "UTC",
  sources: [{ id: pad("s", 0), metrics: keys.map((key) => ({ key, kind: "gauge", exponent: 0 })) }],
};

export function ceilingReadings(firstTs: number): Reading[] {
  const values = Object.fromEntries(keys.map((key) => [key, LIMITS.metricValueMax]));

  return Array.from({ length: LIMITS.readingsPerBatchMax }, (_unused, index) => ({
    source: pad("s", 0),
    ts: firstTs + index,
    values,
  }));
}
