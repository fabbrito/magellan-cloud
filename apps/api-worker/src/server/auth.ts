import { apiClients, type Db } from "@magellan/db";
import { bearerToken, hashToken } from "@magellan/shared";
import { and, eq, isNull } from "drizzle-orm";

// Only a client token reads. A device token is refused like any unknown one: it lives in another
// table, so it resolves to no client.
export async function isClient(db: Db, header: string | undefined): Promise<boolean> {
  const token = bearerToken(header);
  if (token === undefined) return false;

  // A revoked token resolves to no client.
  const [client] = await db
    .select({ id: apiClients.id })
    .from(apiClients)
    .where(and(eq(apiClients.tokenHash, await hashToken(token)), isNull(apiClients.revokedAt)))
    .limit(1);
  return client !== undefined;
}
