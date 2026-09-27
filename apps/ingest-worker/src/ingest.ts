import {
  checkBatchAgainstManifest,
  manifestHash,
  manifestSchema,
  type Batch,
} from "@magellan/contract";
import { manifests, type Db } from "@magellan/db";
import { and, eq } from "drizzle-orm";

import { archiveKey, manifestKey } from "./archive.ts";
import { commitBatch } from "./commit.ts";

// Where a device's writes land. R2 is every byte received; D1 is the index derived from it, so R2
// is written first and a 2xx means both (docs/DESIGN.md invariant 7).
export interface Store {
  db: Db;
  archive: Env["ARCHIVE"];
}

// The hash is over the bytes as received: a re-serialized copy hashes differently (DESIGN §6).
// Returns the hash the device asserts its own against.
export async function declareManifest(
  store: Store,
  deviceId: string,
  bytes: Uint8Array,
  declaredAt: number,
): Promise<string> {
  const hash = await manifestHash(bytes);

  // Without this object D1's row is the only copy, and every archived batch naming this hash would
  // be unrebuildable.
  await store.archive.put(manifestKey(deviceId, hash), bytes, {
    customMetadata: { declared_at: String(declaredAt) },
  });

  // Decoding round-trips: the route already parsed these bytes as JSON, so they are UTF-8.
  await store.db
    .insert(manifests)
    .values({ deviceId, hash, body: new TextDecoder().decode(bytes), declaredAt })
    .onConflictDoNothing();

  return hash;
}

// `manifest_absent`: the named manifest has not arrived — not the device's fault, so it keeps the
// batch. `undeclared`: a reading names what the manifest does not declare — it never will.
export type BatchOutcome = "committed" | "manifest_absent" | "undeclared";

export async function ingestBatch(
  store: Store,
  deviceId: string,
  batch: Batch,
  bytes: ArrayBuffer,
  receivedAt: Date,
): Promise<BatchOutcome> {
  // Every batch that parses is archived, including one naming a manifest that has not arrived — that
  // archive is what rebuilds D1 when it does. The received time rides in metadata, where it is not
  // part of identity.
  await store.archive.put(archiveKey(deviceId, batch.boot_id, batch.seq, receivedAt), bytes, {
    customMetadata: { received_at: String(receivedAt.getTime()) },
  });

  const [declared] = await store.db
    .select({ body: manifests.body })
    .from(manifests)
    .where(and(eq(manifests.deviceId, deviceId), eq(manifests.hash, batch.manifest_hash)))
    .limit(1);
  if (declared === undefined) return "manifest_absent";

  // Throws on a row this cloud wrote and can no longer read: that is a bug here, not a device's.
  const manifest = manifestSchema.parse(JSON.parse(declared.body));
  if (!checkBatchAgainstManifest(manifest, batch).ok) return "undeclared";

  await commitBatch(store.db, deviceId, batch, receivedAt);
  return "committed";
}
