import { daysManifest } from "@magellan/simulator";
import { expect, it } from "vitest";

import { layoutBodySchema, undeclaredCards } from "./layout.ts";

it("finds every card the manifest declares", () => {
  const cards = [
    { source: "source_1", metric: "energy_today", as: "chart" as const },
    { source: "source_1", metric: "power", as: "tile" as const },
  ];

  expect(undeclaredCards(daysManifest, cards)).toEqual([]);
});

it("names a card whose metric or source is undeclared", () => {
  const cards = [
    { source: "source_1", metric: "voltage", as: "chart" as const },
    { source: "source_2", metric: "power", as: "chart" as const },
  ];

  expect(undeclaredCards(daysManifest, cards)).toEqual(cards);
});

it("refuses a card shown as anything but a tile or a chart", () => {
  const body = { cards: [{ source: "source_1", metric: "power", as: "gauge" }] };

  expect(layoutBodySchema.safeParse(body).success).toBe(false);
});

it("refuses a layout with no cards", () => {
  expect(layoutBodySchema.safeParse({ cards: [] }).success).toBe(false);
});
