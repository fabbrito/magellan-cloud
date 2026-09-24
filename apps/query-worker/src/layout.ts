import { indexManifest, keySchema, type Manifest } from "@magellan/contract";
import { z } from "zod";

// A layout is presentation: which metrics to show and as what. What a key means is read from the
// manifest, never stored here (docs/adr/0005-the-device-owns-meaning.md).
const cardsMax = 32;

// A name is a path segment, so it takes a key's URL-unreserved characters and needs no escaping.
export const layoutNameSchema = keySchema;

const cardSchema = z.strictObject({
  source: keySchema,
  metric: keySchema,
  as: z.enum(["tile", "chart"]),
});

export const layoutBodySchema = z.strictObject({
  cards: z.array(cardSchema).min(1).max(cardsMax),
});

export type Card = z.infer<typeof cardSchema>;
export type LayoutBody = z.infer<typeof layoutBodySchema>;

// A layout is saved against the manifest current then; a key a later one drops keeps its card,
// which then charts history.
export function undeclaredCards(manifest: Manifest, cards: Card[]): Card[] {
  const index = indexManifest(manifest);
  return cards.filter((card) => index.get(card.source)?.get(card.metric) === undefined);
}
