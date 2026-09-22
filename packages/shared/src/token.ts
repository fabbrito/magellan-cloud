// Compiled into a Worker and into Bun, so this source names the host globals it needs rather than
// leaning on either one's ambient types (tsconfig.base.json sets `types: []`).
interface HostGlobals {
  crypto: {
    getRandomValues(buffer: Uint8Array): Uint8Array;
    subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
  };
  btoa(binary: string): string;
  TextEncoder: new () => { encode(input: string): Uint8Array };
}

const host = globalThis as unknown as HostGlobals;

// `mgl_` makes a leaked token greppable in a log or a journal and identifiable on sight. 32 bytes is
// 43 base64url characters, unpadded.
export const TOKEN = {
  prefix: "mgl_",
  entropyBytes: 32,
  bodyLength: 43,
  deviceIdLengthMax: 64,
} as const;

export const tokenPattern = new RegExp(`^${TOKEN.prefix}[A-Za-z0-9_-]{${TOKEN.bodyLength}}$`);

// Narrower than the contract's key pattern: an id rides in a URL path and in SQL, so it is limited
// to what needs no escaping in either.
export const deviceIdPattern = new RegExp(`^[a-z0-9][a-z0-9-]{0,${TOKEN.deviceIdLengthMax - 1}}$`);

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return host.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// Returned once at mint and never stored: the cloud keeps only `hashToken`'s output
// (docs/DESIGN.md §8).
export function mintToken(): string {
  const entropy = host.crypto.getRandomValues(new Uint8Array(TOKEN.entropyBytes));
  return `${TOKEN.prefix}${base64url(entropy)}`;
}

// A plain digest, not a password hash: the token is 256 bits of machine entropy, so there is no
// guessing to slow down, and ingest hashes on every request. The digest is internal — nothing
// outside this repo computes it — so the algorithm is free to change on both sides at once.
export async function hashToken(token: string): Promise<string> {
  const digest = await host.crypto.subtle.digest("SHA-256", new host.TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
