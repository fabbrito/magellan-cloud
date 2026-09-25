import { expect, it } from "vitest";

import { seriesQuerySchema, windowOf } from "./query.ts";

const nowMs = 1_790_270_481_000;
const dayMs = 24 * 60 * 60 * 1000;

it("takes the last day when neither bound is given", () => {
  const query = seriesQuerySchema.parse({});

  expect(windowOf(query, nowMs)).toEqual({ fromMs: nowMs - dayMs, toMs: nowMs });
});

it("keeps both bounds when both are given", () => {
  const query = seriesQuerySchema.parse({ from: "1000", to: "2000" });

  expect(windowOf(query, nowMs)).toEqual({ fromMs: 1000, toMs: 2000 });
});

it.each([{ from: "1000" }, { to: "2000" }])("refuses one bound alone: %o", (query) => {
  expect(seriesQuerySchema.safeParse(query).success).toBe(false);
});
