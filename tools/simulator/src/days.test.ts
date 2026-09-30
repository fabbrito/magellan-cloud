import { checkBatchAgainstManifest, manifestSchema, type Batch } from "@magellan/contract";
import { expect, it } from "vitest";

import { daysManifest, daysReadings, energyStep } from "./days.ts";

const readings = daysReadings({
  firstTs: Date.UTC(2026, 0, 1),
  periodMs: 300_000,
  readingsPerDay: 4,
  days: 2,
});

const energies = readings.map((reading) => reading.values["energy_today"] ?? 0);

it("declares a counter that resets daily", () => {
  const counters = daysManifest.sources[0]?.metrics.filter((metric) => metric.kind === "counter");

  expect(manifestSchema.safeParse(daysManifest).success).toBe(true);
  expect(counters).toEqual([expect.objectContaining({ resets: "daily" })]);
});

it("resets the counter once a day, to one step", () => {
  const decreases = energies.flatMap((energy, index) =>
    index > 0 && energy < (energies[index - 1] ?? 0) ? [index] : [],
  );

  expect(decreases).toEqual([4]);
  expect(energies[4]).toBe(energyStep);
});

it("reads under its manifest", () => {
  const batch: Batch = {
    manifest_hash: "0".repeat(64),
    boot_id: "0123456789abcdef",
    seq: "0",
    readings,
  };

  expect(checkBatchAgainstManifest(daysManifest, batch)).toEqual({ ok: true });
});
