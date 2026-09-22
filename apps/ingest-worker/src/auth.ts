import { devices, type Db } from "@magellan/db";
import { hashToken, tokenPattern } from "@magellan/shared";
import { eq } from "drizzle-orm";

// The token is the authority, the path id a claim checked against it
// (docs/adr/0004-the-token-is-the-authority.md). Both refusals are retried, not dropped (DESIGN §6).
export type Authorization = { ok: true } | { ok: false; status: 401 | 403 };

const scheme = "Bearer ";

export async function authorize(
  db: Db,
  header: string | undefined,
  claimedDeviceId: string,
): Promise<Authorization> {
  if (header === undefined) return { ok: false, status: 401 };
  if (!header.startsWith(scheme)) return { ok: false, status: 401 };

  // Shape before work: a megabyte header costs a regex, not a hash.
  const token = header.slice(scheme.length);
  if (!tokenPattern.test(token)) return { ok: false, status: 401 };

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.tokenHash, await hashToken(token)))
    .limit(1);

  if (device === undefined) return { ok: false, status: 401 };
  if (device.id !== claimedDeviceId) return { ok: false, status: 403 };
  return { ok: true };
}
