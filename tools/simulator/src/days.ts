import type { Manifest, Reading } from "@magellan/contract";

// One source with each kind, and a counter that resets daily, so a query has a reset to find.
export const daysManifest: Manifest = {
  sources: [
    {
      id: "source_1",
      metrics: [
        { key: "power", kind: "gauge", unit: "W", exponent: 0 },
        { key: "energy_today", kind: "counter", unit: "kWh", exponent: -2, resets: "daily" },
        { key: "mode", kind: "state", state_labels: { "0": "idle", "1": "running" } },
      ],
    },
  ],
};

export interface DaysOptions {
  firstTs: number;
  periodMs: number;
  readingsPerDay: number;
  days: number;
}

// The counter climbs one `energyStep` a reading and restarts every `readingsPerDay` readings, so
// every delta is one step — the one across a reset included, the value after it being the step.
// The reset sits at a reading index, not a clock boundary: the cloud never reads the boundary.
export const energyStep = 5;

export function daysReadings(options: DaysOptions): Reading[] {
  const count = options.readingsPerDay * options.days;

  return Array.from({ length: count }, (_unused, index) => ({
    source: "source_1",
    ts: options.firstTs + index * options.periodMs,
    values: {
      power: 600,
      energy_today: ((index % options.readingsPerDay) + 1) * energyStep,
      mode: 1,
    },
  }));
}
