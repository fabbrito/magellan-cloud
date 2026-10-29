import { bearerToken, hashToken } from "@magellan/token";

const digestPattern = /^[0-9a-f]{64}$/;

// The admin token is the deployment's, not a Token: its hash is a secret the deploy ships, never a
// registry row. A deploy without a well-formed one throws — every request a 500, none let in.
export async function isAdminToken(
  header: string | undefined,
  adminTokenHash: string,
): Promise<boolean> {
  if (!digestPattern.test(adminTokenHash)) throw new Error("ADMIN_TOKEN_HASH is not a digest");
  const token = bearerToken(header);
  if (token === undefined) return false;

  // Equal lengths, both 64 hex characters, as timingSafeEqual requires.
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(
    encoder.encode(await hashToken(token)),
    encoder.encode(adminTokenHash),
  );
}
