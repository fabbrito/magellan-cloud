// `mgl_` makes a leaked token greppable in a log or a journal and identifiable on sight. 32 bytes is
// 43 base64url characters, unpadded.
export const TOKEN = {
  prefix: "mgl_",
  entropyBytes: 32,
  bodyLength: 43,
  idLengthMax: 64,
} as const;

export const tokenPattern = new RegExp(`^${TOKEN.prefix}[A-Za-z0-9_-]{${TOKEN.bodyLength}}$`);

// A device's or a client's id. Narrower than the contract's key pattern: an id rides in a URL path
// and in SQL, so it is limited to what needs no escaping in either.
export const idPattern = new RegExp(`^[a-z0-9][a-z0-9-]{0,${TOKEN.idLengthMax - 1}}$`);

const scheme = "Bearer ";

// The token an `Authorization` header carries, or undefined for any other shape. Shape before
// work: a megabyte header costs a regex, not a hash.
export function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined || !header.startsWith(scheme)) return undefined;
  const token = header.slice(scheme.length);
  return tokenPattern.test(token) ? token : undefined;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// Returned once at mint and never stored: the cloud keeps only `hashToken`'s output
// (docs/DESIGN.md §8).
export function mintToken(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(TOKEN.entropyBytes));
  return `${TOKEN.prefix}${base64url(entropy)}`;
}

// A plain digest, not a password hash: the token is 256 bits of machine entropy, so there is no
// guessing to slow down, and ingest hashes on every request. The digest is internal — nothing
// outside this repo computes it — so the algorithm is free to change on both sides at once.
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
