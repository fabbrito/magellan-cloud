// Strips only the ends, so a value the cloud's edge rewrites still fails the comparison.
export function etagHash(etag: string): string {
  return etag
    .trim()
    .replace(/^(?:W\/)*/, "")
    .replace(/^"*|"*$/g, "");
}
