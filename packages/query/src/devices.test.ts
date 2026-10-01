import type { Manifest } from "@magellan/contract";
import { expect, it } from "vitest";

import { metricRows, sourceHealthRowsOf } from "./devices.ts";

it("lists one row a metric, labelled by its source", () => {
  const manifest: Manifest = {
    tz: "UTC",
    sources: [
      { id: "source_1", metrics: [{ key: "power", kind: "gauge", unit: "W", exponent: -1 }] },
      { id: "source_2", metrics: [{ key: "mode", kind: "state" }] },
    ],
  };

  expect(metricRows(manifest)).toEqual([
    { source: "source_1", metric: "power", kind: "gauge", unit: "W", exponent: -1 },
    { source: "source_2", metric: "mode", kind: "state" },
  ]);
});

it("answers each source last heard in id order, as an instant", () => {
  expect(sourceHealthRowsOf({ outlet: 0, inlet: 1_767_225_600_000 })).toEqual([
    { source: "inlet", last_heard: "2026-01-01T00:00:00.000Z" },
    { source: "outlet", last_heard: "1970-01-01T00:00:00.000Z" },
  ]);
});

// Code-unit order, not a locale's: an uppercase id sorts before every lowercase one.
it("orders ids by code unit", () => {
  const rows = sourceHealthRowsOf({ b: 0, a: 0, Z: 0 });

  expect(rows.map((row) => row.source)).toEqual(["Z", "a", "b"]);
});

it("answers no rows for a device that has heard no source", () => {
  expect(sourceHealthRowsOf({})).toEqual([]);
});
