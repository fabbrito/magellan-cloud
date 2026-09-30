// Scaling one metric's readings. Pure: the rows come in resolved, each value beside the exponent of
// the manifest it was read under, so a metric re-scaled mid-range charts each value by its own
// (docs/adr/0002-integer-values.md).

export interface Sample {
  ts: number;
  exponent: number;
  value: number;
}

// Dividing by an exact power of ten rounds once; multiplying by 10^-n would round the factor first.
export function scale(value: number, exponent: number): number {
  if (exponent < 0) return value / 10 ** -exponent;
  return value * 10 ** exponent;
}
