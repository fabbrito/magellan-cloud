import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  batchSchema,
  checkBatchAgainstManifest,
  manifestHash,
  manifestSchema,
} from "@magellan/contract";
import { getDb, manifests, type Db } from "@magellan/db";
import { and, eq } from "drizzle-orm";

import { archiveKey, manifestKey } from "./archive.ts";
import { authorize } from "./auth.ts";
import { commitBatch } from "./commit.ts";

// Under /v1 because the device's configured endpoint already carries it (docs/DESIGN.md §6).
const app = new OpenAPIHono<{ Bindings: Env; Variables: { db: Db } }>();

// Before the route validators: a rejected credential answers 401, never 4xx about a body the
// caller was never entitled to send.
app.use("/v1/devices/:id/*", async (context, next) => {
  // Per request, never module scope: two requests share an instance (docs/STYLE.md).
  const db = getDb(context.env.DB);
  const header = context.req.header("authorization");

  const authorization = await authorize(db, header, context.req.param("id"));
  if (!authorization.ok) return context.body(null, authorization.status);

  context.set("db", db);
  await next();
});

const manifestRoute = createRoute({
  method: "put",
  path: "/v1/devices/{id}/manifest",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: manifestSchema } }, required: true },
  },
  responses: {
    200: { description: "The manifest is stored." },
    400: { description: "The body is not a manifest. A device must not retry it." },
    401: { description: "The credential is absent or resolves to no device." },
    403: { description: "The credential names another device." },
  },
});

app.openapi(manifestRoute, async (context) => {
  const { id } = context.req.valid("param");

  // The hash is over the bytes as received: a re-serialized copy hashes differently (DESIGN §6).
  const bytes = new Uint8Array(await context.req.arrayBuffer());
  const hash = await manifestHash(bytes);

  // R2 before D1, as for a batch: D1's manifests table is a derived index, and without this object
  // it is the only copy — every archived batch naming this hash would be unrebuildable (invariant 7).
  const declaredAt = Date.now();
  await context.env.ARCHIVE.put(manifestKey(id, hash), bytes, {
    customMetadata: { declared_at: String(declaredAt) },
  });

  // Decoding round-trips: the validator already parsed these bytes as JSON, so they are UTF-8.
  await context
    .get("db")
    .insert(manifests)
    .values({
      deviceId: id,
      hash,
      body: new TextDecoder().decode(bytes),
      declaredAt,
    })
    .onConflictDoNothing();

  return context.body(null, 200, { ETag: `"${hash}"` });
});

const batchesRoute = createRoute({
  method: "post",
  path: "/v1/devices/{id}/batches",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: batchSchema } }, required: true },
  },
  responses: {
    204: { description: "Committed, or already present." },
    400: { description: "The body is not a batch. A device must not retry it." },
    401: { description: "The credential is absent or resolves to no device." },
    403: { description: "The credential names another device." },
    422: { description: "A reading names what the manifest does not declare." },
    503: { description: "The named manifest has not arrived. The device keeps the buffer." },
  },
});

app.openapi(batchesRoute, async (context) => {
  const { id } = context.req.valid("param");
  const batch = context.req.valid("json");
  const db = context.get("db");

  // R2 before D1, so 2xx means both (docs/DESIGN.md §6). Every batch that parses is archived,
  // including one naming a manifest that has not arrived — that archive is what rebuilds D1 when it
  // does. The received time rides in metadata, where it is not part of identity.
  const receivedAt = new Date();
  await context.env.ARCHIVE.put(
    archiveKey(id, batch.boot_id, batch.seq, receivedAt),
    await context.req.arrayBuffer(),
    { customMetadata: { received_at: String(receivedAt.getTime()) } },
  );

  const [declared] = await db
    .select({ body: manifests.body })
    .from(manifests)
    .where(and(eq(manifests.deviceId, id), eq(manifests.hash, batch.manifest_hash)))
    .limit(1);

  if (declared === undefined) return context.body(null, 503);

  // Throws on a row this cloud wrote and can no longer read: that is a bug here, not a device's.
  const manifest = manifestSchema.parse(JSON.parse(declared.body));
  if (!checkBatchAgainstManifest(manifest, batch).ok) return context.body(null, 422);

  await commitBatch(db, id, batch, receivedAt);

  return context.body(null, 204);
});

export default app;
