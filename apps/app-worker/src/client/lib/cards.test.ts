import type { Card } from "@magellan/query/api";
import { describe, expect, it } from "vitest";

import { addCard, moveCard, removeCard } from "./cards.ts";

const power: Card = { source: "inverter", metric: "power", as: "chart" };
const energy: Card = { source: "inverter", metric: "energy_today", as: "tile" };
const state: Card = { source: "inverter", metric: "state", as: "tile" };

describe("addCard", () => {
  it("appends", () => {
    expect(addCard([power], energy)).toEqual([power, energy]);
  });

  it("keeps one of the same card", () => {
    expect(addCard([power, energy], { ...power })).toEqual([power, energy]);
  });

  it("takes the same metric shown another way", () => {
    const tile: Card = { ...power, as: "tile" };
    expect(addCard([power], tile)).toEqual([power, tile]);
  });
});

describe("removeCard", () => {
  it("drops the card at the index, only that one", () => {
    expect(removeCard([power, energy, state], 1)).toEqual([power, state]);
  });
});

describe("moveCard", () => {
  it("swaps with the neighbour above", () => {
    expect(moveCard([power, energy, state], 2, -1)).toEqual([power, state, energy]);
  });

  it("swaps with the neighbour below", () => {
    expect(moveCard([power, energy, state], 0, 1)).toEqual([energy, power, state]);
  });

  it("leaves the ends where they are, never wrapping", () => {
    const cards = [power, energy];
    expect(moveCard(cards, 0, -1)).toBe(cards);
    expect(moveCard(cards, 1, 1)).toBe(cards);
  });
});
