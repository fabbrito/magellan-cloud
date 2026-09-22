// One prefix a device, then one a kind, so retiring a device is a prefix sweep and listing either
// kind is exact. Keyed by the date the cloud received the batch, not a measured one: a
// device's clock reads 1970
// until the network steps it, and `ts` varies per reading inside one batch. Day granularity keeps a
// retry idempotent — it overwrites the identical object — and only a replay across midnight costs a
// duplicate.
export function archiveKey(
  deviceId: string,
  bootId: string,
  seq: string,
  receivedAt: Date,
): string {
  const year = receivedAt.getUTCFullYear();
  const month = String(receivedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(receivedAt.getUTCDate()).padStart(2, "0");

  return `${deviceId}/batches/${year}/${month}/${day}/${bootId}-${seq}`;
}

// The hash is what identifies a manifest, so it is the whole key: a redeclaration overwrites the
// identical object.
export function manifestKey(deviceId: string, hash: string): string {
  return `${deviceId}/manifests/${hash}`;
}
