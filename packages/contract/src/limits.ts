// Bounds are not decoration: an unbounded batch spends unbounded CPU against a fixed cost budget,
// and an unbounded manifest is a row count the D1 budget cannot absorb (docs/DESIGN.md §2).
// `readingsPerBatchMax` is the cloud's ceiling on the rows one commit writes, not the device's
// batch size: a device sends what its buffer holds, up to this.
//
// `metricValueMin`/`metricValueMax` are where JavaScript stops being exact, not where a value is
// expected to reach: the bound exists so a device's wider integer knows where the contract ends.
//
// Every pattern in schema.ts interpolates these; a bound a reader trusts is the bound the parser
// applies, so there is no second copy to drift.
export const LIMITS = {
  sourcesMax: 32,
  metricsPerSourceMax: 128,
  keyLengthMax: 64,
  unitLengthMax: 16,
  exponentMin: -12,
  exponentMax: 12,
  metricValueMin: -9_007_199_254_740_991,
  metricValueMax: 9_007_199_254_740_991,
  stateCodeDigitsMax: 9,
  stateLabelsMax: 64,
  stateLabelLengthMax: 32,
  readingsPerBatchMax: 512,
  seqDigitsMax: 20,
  seqMax: 18_446_744_073_709_551_615n,
  manifestHashHexLength: 64,
  timestampMsMax: 32_503_680_000_000,
  uptimeSecondsMax: 315_576_000,
  bufferDepthMax: 1_000_000,
  batteryPercentMax: 100,
  signalPercentMax: 100,
  firmwareVersionLengthMax: 32,
  bootIdLengthMin: 8,
  bootIdLengthMax: 32,
  // What a body may weigh. The worker refuses on the declared `content-length`, so an oversized
  // body costs a header read rather than a parse, and one that declares no length is refused
  // outright. They sit just above what the bounds above already permit — 12.17 MiB and 5.30 MiB,
  // which limits.test.ts recomputes — so nothing legal is refused. Lowering either is a contract
  // change.
  manifestBytesMax: 13 * 1024 * 1024,
  batchBytesMax: 6 * 1024 * 1024,
} as const;
