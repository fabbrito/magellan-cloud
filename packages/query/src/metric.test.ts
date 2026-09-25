import type { Manifest } from "@magellan/contract";
import { expect, it } from "vitest";

import { describeMetric, exponentsOf } from "./metric.ts";

const withPower = (exponent: number): Manifest => ({
  tz: "UTC",
  sources: [{ id: "source_1", metrics: [{ key: "power", kind: "gauge", unit: "W", exponent }] }],
});

const withoutPower: Manifest = {
  tz: "UTC",
  sources: [{ id: "source_1", metrics: [{ key: "mode", kind: "state" }] }],
};

it("describes a metric by the latest manifest declaring it", () => {
  const declarations = [
    { hash: "new", declaredAt: 2, manifest: withPower(-1) },
    { hash: "old", declaredAt: 1, manifest: withPower(0) },
  ];

  expect(describeMetric(declarations, "source_1", "power")).toMatchObject({ exponent: -1 });
});

it("describes a metric the current manifest dropped", () => {
  const declarations = [
    { hash: "old", declaredAt: 1, manifest: withPower(0) },
    { hash: "new", declaredAt: 2, manifest: withoutPower },
  ];

  expect(describeMetric(declarations, "source_1", "power")).toMatchObject({ key: "power" });
});

it("scales each manifest's readings by that manifest's exponent", () => {
  const declarations = [
    { hash: "old", declaredAt: 1, manifest: withPower(0) },
    { hash: "new", declaredAt: 2, manifest: withPower(-1) },
    { hash: "none", declaredAt: 3, manifest: withoutPower },
  ];

  expect(exponentsOf(declarations, "source_1", "power")).toEqual(
    new Map([
      ["old", 0],
      ["new", -1],
    ]),
  );
});
