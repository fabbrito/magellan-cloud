// Each item beside the one after it, in order: n items give n - 1 pairs.
export function pairs<Item>(items: readonly Item[]): [Item, Item][] {
  const result: [Item, Item][] = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous === undefined || current === undefined) throw new Error("index past items");
    result.push([previous, current]);
  }
  return result;
}
