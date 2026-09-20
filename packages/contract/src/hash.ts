// Compiled inside every consumer — a browser app, a Worker, Bun — this source cannot lean on any one
// of their ambient types. The one host global it needs is named here, where the cast stays visible.
interface WebCryptoLike {
  subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
}

// The manifest's identity is SHA-256 over the exact bytes the device sends and the cloud receives.
// Hashing the same buffer needs no canonical form and no cross-side rule to agree on: a mismatch can
// only mean the device hashed a different buffer than it sent, and the accepted hash returned from the
// upload exposes that at the first exchange rather than as an unknown manifest hash the device retries
// forever.
export async function manifestHash(manifestBytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as unknown as { crypto?: WebCryptoLike }).crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto is unavailable");
  const digest = await subtle.digest("SHA-256", manifestBytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
