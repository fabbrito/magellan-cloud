import { devices, type Db } from "@magellan/db";
import { bearerToken, hashToken } from "@magellan/token";
import { and, eq, isNull } from "drizzle-orm";

// The token is the authority, the path id a claim checked against it
// (docs/adr/0004-the-token-is-the-authority.md). Both refusals are retried, not dropped
// (docs/DESIGN.md §6).
export type Authorization = { ok: true } | { ok: false; status: 401 | 403 };

export async function authorize(
  db: Db,
  header: string | undefined,
  claimedDeviceId: string,
): Promise<Authorization> {
  const token = bearerToken(header);
  if (token === undefined) return { ok: false, status: 401 };

  // A revoked token resolves to no device.
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.tokenHash, await hashToken(token)), isNull(devices.revokedAt)))
    .limit(1);

  if (device === undefined) return { ok: false, status: 401 };
  if (device.id !== claimedDeviceId) return { ok: false, status: 403 };
  return { ok: true };
}
