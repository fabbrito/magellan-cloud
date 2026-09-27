import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { batchSchema, LIMITS, manifestSchema } from "@magellan/contract";
import { getDb } from "@magellan/db";
import { resolveToken } from "@magellan/token";
import type { Context, Next } from "hono";

import { declareManifest, ingestBatch, type Store } from "./ingest.ts";

// Under /v1 because the device's configured endpoint already carries it (docs/DESIGN.md §6).
const app = new OpenAPIHono<{ Bindings: Env; Variables: { store: Store } }>();

// Before the route validators: a rejected credential answers 401, never 4xx about a body the
// caller was never entitled to send.
app.use("/v1/devices/:id/*", async (context, next) => {
  // Per request, never module scope: two requests share an instance (docs/STYLE.md).
  const db = getDb(context.env.DB);
  const header = context.req.header("authorization");

  // The token is the authority, the path id a claim checked against it
  // (docs/adr/0004-the-token-is-the-authority.md). Both refusals are retried, not dropped
  // (docs/DESIGN.md §6).
  const deviceId = await resolveToken(db, "device", header);
  if (deviceId === undefined) return context.body(null, 401);
  if (deviceId !== context.req.param("id")) return context.body(null, 403);

  context.set("store", { db, archive: context.env.ARCHIVE });
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
  const bytes = new Uint8Array(await context.req.arrayBuffer());
  const hash = await declareManifest(context.get("store"), id, bytes, Date.now());
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
  const bytes = await context.req.arrayBuffer();

  const outcome = await ingestBatch(context.get("store"), id, batch, bytes, new Date());
  switch (outcome) {
    case "committed":
      return context.body(null, 204);
    case "manifest_absent":
      return context.body(null, 503);
    case "undeclared":
      return context.body(null, 422);
  }
});

// Chosen, not inherited: a fault here is never the device's, so it answers the class that keeps the
// buffer and retries (docs/DESIGN.md §6). A batch that reached the archive stays there. Logged for
// the tail.
app.onError((error, context) => {
  console.error(error);
  return context.body(null, 500);
});

export default app;
