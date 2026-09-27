// The manifest's identity is SHA-256 over the exact bytes the device sends and the cloud receives.
// Hashing the same buffer needs no canonical form and no cross-side rule to agree on: a mismatch can
// only mean the device hashed a different buffer than it sent, and the accepted hash returned from the
// upload exposes that at the first exchange rather than as an unknown manifest hash the device retries
// forever.
//
// The runtimes disagree on what a byte view may sit on — Workers types a shared buffer in, WebCrypto
// types it out — so the digest reads a copy. A manifest is at most a D1 row, and declared rarely.
export async function manifestHash(manifestBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(manifestBytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
