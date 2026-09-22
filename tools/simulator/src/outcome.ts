// The device's reading of the status classes, transcribed from `crates/runtime/src/upload.rs`'s
// `classify` in the device repository. It is transcribed rather than shared: the two repositories
// agree through the contract, never through code (docs/DESIGN.md invariant 9). If this disagrees
// with the cloud's answers, one of the two is wrong and a test here is where it shows.
export type Outcome =
  // Committed, or already present: drop the batch.
  | "committed"
  // Refused for good: drop it and log.
  | "rejected"
  // The credential is the maintainer's to fix, so the buffer is kept, not dropped.
  | "credential"
  // Unknown or not now: keep the buffer and retry.
  | "unavailable";

export function classify(status: number): Outcome {
  if (status >= 200 && status <= 299) return "committed";
  if (status === 401 || status === 403) return "credential";
  if (status === 429) return "unavailable";
  if (status >= 400 && status <= 499) return "rejected";
  return "unavailable";
}
