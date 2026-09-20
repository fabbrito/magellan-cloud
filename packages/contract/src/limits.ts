// Bounds are not decoration: an unbounded batch spends unbounded CPU against a fixed cost budget,
// and an unbounded manifest is a row count the D1 budget cannot absorb (docs/DESIGN.md §2).
// `readingsPerBatchMax` is provisional: it caps the rows one commit writes, and the device's buffer is
// what settles it (`magellan-device` owns that number).
//
// Every pattern in schema.ts interpolates these; a bound a reader trusts is the bound the parser
// applies, so there is no second copy to drift.
export const LIMITS = {
  sourcesMax: 32,
  metricsPerSourceMax: 128,
  keyLengthMax: 64,
  unitLengthMax: 16,
  stateCodeDigitsMax: 9,
  stateLabelsMax: 64,
  stateLabelLengthMax: 32,
  readingsPerBatchMax: 512,
  seqDigitsMax: 20,
  manifestHashHexLength: 64,
  timestampMsMax: 32_503_680_000_000,
  uptimeSecondsMax: 315_576_000,
  bufferDepthMax: 1_000_000,
  batteryPercentMax: 100,
  signalMax: 100,
  firmwareVersionLengthMax: 32,
  bootIdLengthMin: 8,
  bootIdLengthMax: 32,
} as const;
