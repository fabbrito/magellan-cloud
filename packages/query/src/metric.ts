import { indexManifest, type Manifest, type Metric } from "@magellan/contract";

export interface Declaration {
  hash: string;
  declaredAt: number;
  manifest: Manifest;
}

export function metricOf(manifest: Manifest, source: string, key: string): Metric | undefined {
  return indexManifest(manifest).get(source)?.get(key);
}

// What a metric is comes from the latest manifest declaring it, so a key the current manifest
// dropped still charts its history (docs/adr/0005-the-device-owns-meaning.md).
export function describeMetric(
  declarations: Declaration[],
  source: string,
  key: string,
): Metric | undefined {
  const latestFirst = declarations.toSorted((left, right) => right.declaredAt - left.declaredAt);
  for (const declaration of latestFirst) {
    const metric = metricOf(declaration.manifest, source, key);
    if (metric !== undefined) return metric;
  }
  return undefined;
}

// Each reading scales by the manifest it was read under. A state has no exponent: its code is 0.
// Ingest refuses a value its manifest does not declare, so a hash with no exponent is a bug here.
export function exponentLookup(
  declarations: Declaration[],
  source: string,
  key: string,
): (hash: string) => number {
  const exponents = new Map<string, number>();
  for (const declaration of declarations) {
    const metric = metricOf(declaration.manifest, source, key);
    if (metric === undefined) continue;
    exponents.set(declaration.hash, metric.kind === "state" ? 0 : metric.exponent);
  }
  return (hash) => {
    const exponent = exponents.get(hash);
    if (exponent === undefined) throw new Error(`manifest ${hash} lacks ${source}:${key}`);
    return exponent;
  };
}
