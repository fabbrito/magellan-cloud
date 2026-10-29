// The simulator writes readings, so it never reaches a live deployment: only a cloud on this
// machine, the one `bun run dev` serves. By address, but for `localhost`: loopback by convention
// (RFC 6761), though a hosts file can repoint it.
export function isLoopback(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.hostname === "localhost") return true;
  if (url.hostname === "[::1]") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
}
