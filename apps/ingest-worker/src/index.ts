import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  batchSchema,
  LIMITS,
  checkBatchAgainstManifest,
  manifestHash,
  manifestSchema,
} from "@magellan/contract";
import { getDb, manifests, type Db } from "@magellan/db";
import { and, eq } from "drizzle-orm";
import type { Context, Next } from "hono";

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

// Named in the document so the device reads the scheme rather than inferring it from a 401.
app.openAPIRegistry.registerComponent("securitySchemes", "deviceToken", {
  type: "http",
  scheme: "bearer",
});

// Digits only, and few enough that a forged header costs a bounded regex rather than a scan.
const contentLengthPattern = /^\d{1,15}$/;

// A body the device will not measure is one the cloud will not read: with no parseable length there
// is nothing to refuse against until the bytes are already spent. Both refusals are 4xx, which a
// device drops rather than retries (docs/DESIGN.md §6).
async function refuseOversized(context: Context, next: Next, bytesMax: number) {
  const declared = context.req.header("content-length");
  if (declared === undefined || !contentLengthPattern.test(declared)) {
    return context.body(null, 411);
  }
  if (Number(declared) > bytesMax) return context.body(null, 413);
  await next();
}

app.use("/v1/devices/:id/manifest", (context, next) =>
  refuseOversized(context, next, LIMITS.manifestBytesMax),
);
app.use("/v1/devices/:id/batches", (context, next) =>
  refuseOversized(context, next, LIMITS.batchBytesMax),
);

const manifestRoute = createRoute({
  method: "put",
  path: "/v1/devices/{id}/manifest",
  security: [{ deviceToken: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: manifestSchema } },
      required: true,
      "x-max-bytes": LIMITS.manifestBytesMax,
    },
  },
  responses: {
    200: {
      description: "The manifest is stored.",
      // The device ends its run on a missing or disagreeing one, so it is part of the wire the
      // document states rather than a header the device learns elsewhere (docs/DESIGN.md §6).
      headers: z.object({
        ETag: z.string().meta({ description: "The accepted manifest hash, quoted." }),
      }),
    },
    400: { description: "The body is not a manifest. A device must not retry it." },
    401: { description: "The credential is absent or resolves to no device." },
    403: { description: "The credential names another device." },
    411: { description: "No parseable `content-length`. A device must declare what it sends." },
    413: { description: `The body is past ${LIMITS.manifestBytesMax} bytes.` },
    429: { description: "Too many requests. The device keeps the buffer." },
  },
});

app.openapi(manifestRoute, async (context) => {
  const { id } = context.req.valid("param");

  // The hash is over the bytes as received: a re-serialized copy hashes differently (DESIGN §6).
  const bytes = new Uint8Array(await context.req.arrayBuffer());
  const hash = await manifestHash(bytes);

  // R2 before D1, as for a batch: D1's manifests table is a derived index, and without this object
  // it is the only copy — every archived batch naming this hash would be unrebuildable
  // (docs/DESIGN.md invariant 7).
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
  security: [{ deviceToken: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { "application/json": { schema: batchSchema } },
      required: true,
      "x-max-bytes": LIMITS.batchBytesMax,
    },
  },
  responses: {
    204: { description: "Committed, or already present." },
    400: { description: "The body is not a batch. A device must not retry it." },
    401: { description: "The credential is absent or resolves to no device." },
    403: { description: "The credential names another device." },
    411: { description: "No parseable `content-length`. A device must declare what it sends." },
    413: { description: `The body is past ${LIMITS.batchBytesMax} bytes.` },
    422: { description: "A reading names what the manifest does not declare." },
    429: { description: "Too many requests. The device keeps the buffer." },
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
