import type { Card } from "@magellan/query/api";

// A draft layout's edits. Pure, so the editor holds one array and every change replaces it.

export function sameCard(a: Card, b: Card): boolean {
  return a.source === b.source && a.metric === b.metric && a.as === b.as;
}

// The same metric may sit twice — a tile and a chart — but the same card once.
export function addCard(cards: Card[], card: Card): Card[] {
  return cards.some((each) => sameCard(each, card)) ? cards : [...cards, card];
}

export function removeCard(cards: Card[], index: number): Card[] {
  return cards.filter((_, each) => each !== index);
}

// Swaps with a neighbour; at either end it is a no-op, not a wrap.
export function moveCard(cards: Card[], index: number, by: -1 | 1): Card[] {
  const target = index + by;
  const card = cards[index];
  const neighbour = cards[target];
  if (card === undefined || neighbour === undefined) return cards;
  const moved = [...cards];
  moved[index] = neighbour;
  moved[target] = card;
  return moved;
}
