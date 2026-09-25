import { keySchema, type Manifest } from "@magellan/contract";
import { z } from "zod";

import { shownAs } from "./api.ts";
import { metricOf } from "./metric.ts";

// Presentation only (docs/adr/0005-the-device-owns-meaning.md).
const cardsMax = 32;

// A name is a path segment, so it takes a key's URL-unreserved characters and needs no escaping.
export const layoutNameSchema = keySchema;

const cardSchema = z.strictObject({
  source: keySchema,
  metric: keySchema,
  as: z.enum(shownAs),
});

export const layoutBodySchema = z.strictObject({
  cards: z.array(cardSchema).min(1).max(cardsMax),
});

export type Card = z.infer<typeof cardSchema>;
export type LayoutBody = z.infer<typeof layoutBodySchema>;

// Checked on save only: a key a later manifest drops keeps its card, which charts history.
export function undeclaredCards(manifest: Manifest, cards: Card[]): Card[] {
  return cards.filter((card) => metricOf(manifest, card.source, card.metric) === undefined);
}
